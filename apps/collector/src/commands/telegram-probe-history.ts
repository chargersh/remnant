import { BunRuntime, BunServices } from "@effect/platform-bun";
import { env } from "@remnant/env/collector";
import bigInt from "big-integer";
import { Cause, Console, Effect, Exit, FileSystem, Layer, Path } from "effect";
import { Command, Prompt } from "effect/unstable/cli";
import { Api } from "telegram";
import {
  type TelegramClient,
  type TelegramClientError,
  telegramClientLayer,
} from "@/providers/telegram/client/client";
import {
  type TelegramSessionNotConfiguredError,
  TelegramSessionStore,
  telegramSessionStoreLayer,
} from "@/providers/telegram/client/session-store";
import {
  getTelegramDialogs,
  type TelegramDialog,
} from "@/providers/telegram/dialogs/dialogs";
import { TelegramHistory } from "@/providers/telegram/messages/history/fetch-page";
import { normalizeTelegramHistoryPage } from "@/providers/telegram/messages/history/normalize-page";
import { normalizeTelegramMessage } from "@/providers/telegram/messages/normalization/message";
import { encodeTelegramRawValue } from "@/providers/telegram/serialization/raw-value";
import packageJson from "../../package.json";

const DIALOG_DISCOVERY_LIMIT = 100;
const HISTORY_LIMIT = 10;
const MAX_SELECTED_DIALOGS = 10;
const REPORT_FORMAT_VERSION = 2 as const;

interface ProbeDialog {
  readonly dialog: TelegramDialog;
  readonly inputPeer: Api.TypeInputPeer;
}

const dialogKind = (dialog: TelegramDialog) => {
  if (dialog.peerKind === "user") {
    return dialog.isSelf ? "saved messages" : "user";
  }

  if (dialog.peerKind === "chat") {
    return "basic group";
  }

  return dialog.type === "group" ? "supergroup" : "channel";
};

const makeInputPeer = (
  dialog: TelegramDialog
): Api.TypeInputPeer | undefined => {
  if (dialog.peerKind === "chat") {
    return dialog.availability === "available"
      ? new Api.InputPeerChat({ chatId: bigInt(dialog.peerId) })
      : undefined;
  }

  if (dialog.peerKind === "channel") {
    return dialog.availability === "available"
      ? new Api.InputPeerChannel({
          accessHash: bigInt(dialog.accessHash),
          channelId: bigInt(dialog.peerId),
        })
      : undefined;
  }

  if (dialog.isSelf) {
    return new Api.InputPeerSelf();
  }

  return dialog.accessHash
    ? new Api.InputPeerUser({
        accessHash: bigInt(dialog.accessHash),
        userId: bigInt(dialog.peerId),
      })
    : undefined;
};

const toProbeDialog = (dialog: TelegramDialog): ProbeDialog | undefined => {
  const inputPeer = makeInputPeer(dialog);
  return inputPeer ? { dialog, inputPeer } : undefined;
};

const telegramClientFromSessionLayer: Layer.Layer<
  TelegramClient,
  TelegramClientError | TelegramSessionNotConfiguredError,
  TelegramSessionStore
> = Layer.unwrap(
  Effect.gen(function* () {
    const sessionStore = yield* TelegramSessionStore;
    const session = yield* sessionStore.require;

    return telegramClientLayer({
      apiHash: env.TELEGRAM_API_HASH,
      apiId: env.TELEGRAM_API_ID,
      session,
    });
  })
);

const telegramProbeLayer = TelegramHistory.layer.pipe(
  Layer.provideMerge(telegramClientFromSessionLayer),
  Layer.provide(telegramSessionStoreLayer)
);

const runProbe = Effect.fn("TelegramHistoryProbe.run")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dialogs = yield* getTelegramDialogs({ limit: DIALOG_DISCOVERY_LIMIT });
  const accountPeerId = dialogs.find(
    (dialog) => dialog.peerKind === "user" && dialog.isSelf
  )?.peerId;

  if (accountPeerId === undefined) {
    yield* Console.log(
      "The authenticated Telegram account was not present in the dialog list, so message senders cannot be normalized safely."
    );
    return;
  }

  const candidates = dialogs.flatMap((dialog) => {
    const candidate = toProbeDialog(dialog);
    return candidate ? [candidate] : [];
  });

  if (candidates.length === 0) {
    yield* Console.log("No accessible Telegram dialogs were found.");
    return;
  }

  const selected = yield* Prompt.multiSelect({
    choices: candidates.map((candidate) => ({
      description: `${dialogKind(candidate.dialog)} · peer ${candidate.dialog.peerId}`,
      title: candidate.dialog.name,
      value: candidate,
    })),
    max: Math.min(MAX_SELECTED_DIALOGS, candidates.length),
    maxPerPage: 12,
    message: `Select up to ${Math.min(MAX_SELECTED_DIALOGS, candidates.length)} dialogs to inspect`,
    min: 1,
  });

  yield* Console.log("");
  yield* Console.log(
    "The probe will fetch one page of at most 10 messages from:"
  );
  yield* Effect.forEach(
    selected,
    ({ dialog }) =>
      Console.log(
        `  - ${dialog.name} (${dialogKind(dialog)}, ${dialog.peerId})`
      ),
    { discard: true }
  );
  yield* Console.log("");
  yield* Console.log(
    "The full Telegram response and normalized messages will be written to a local gitignored JSON file."
  );

  const confirmed = yield* Prompt.confirm({
    initial: false,
    message: "Continue with the history fetch?",
  });

  if (!confirmed) {
    yield* Console.log("History probe cancelled. No history was fetched.");
    return;
  }

  const history = yield* TelegramHistory;
  const results = yield* Effect.forEach(
    selected,
    ({ dialog, inputPeer }, index) =>
      Effect.gen(function* () {
        yield* Console.log(`Fetching ${index + 1}/${selected.length}...`);
        const observedAt = Date.now();
        const page = yield* history.fetchPage({
          limit: HISTORY_LIMIT,
          peer: inputPeer,
          peerContext: {
            id: dialog.peerId,
            kind: dialog.peerKind,
          },
        });
        const rawHistory = yield* encodeTelegramRawValue(page.raw);
        const normalizationExit = yield* Effect.exit(
          normalizeTelegramHistoryPage(page, { accountPeerId, observedAt })
        );

        if (Exit.isSuccess(normalizationExit)) {
          return {
            dialog,
            history: normalizationExit.value,
            observedAt,
            status: "success" as const,
          };
        }

        const failedMessages = (yield* Effect.forEach(
          page.messages,
          (message, messageIndex) =>
            Effect.gen(function* () {
              const messageExit = yield* Effect.exit(
                normalizeTelegramMessage(message, {
                  accountPeerId,
                  observedAt,
                })
              );

              if (Exit.isSuccess(messageExit)) {
                return;
              }

              return {
                cause: Cause.pretty(messageExit.cause),
                index: messageIndex,
                raw: yield* encodeTelegramRawValue(message),
                telegramConstructor: message.className,
                telegramMessageId: message.id,
              };
            }),
          { concurrency: 1 }
        )).filter((failure) => failure !== undefined);

        return {
          cause: Cause.pretty(normalizationExit.cause),
          dialog,
          failedMessages,
          observedAt,
          rawHistory,
          status: "normalizationFailed" as const,
        };
      }),
    { concurrency: 1 }
  );

  const capturedAt = new Date().toISOString();
  const sourceDirectory = yield* path.fromFileUrl(
    new URL(".", import.meta.url)
  );
  const outputDirectory = path.resolve(
    sourceDirectory,
    "..",
    ".artifacts",
    "telegram-history"
  );
  const fileName = `history-${capturedAt.replaceAll(":", "-")}.json`;
  const outputPath = path.join(outputDirectory, fileName);
  const report = {
    capturedAt,
    dialogDiscoveryLimit: DIALOG_DISCOVERY_LIMIT,
    formatVersion: REPORT_FORMAT_VERSION,
    historyLimit: HISTORY_LIMIT,
    results,
  };
  const failedResultCount = results.filter(
    (result) => result.status === "normalizationFailed"
  ).length;

  yield* fileSystem.makeDirectory(outputDirectory, {
    mode: 0o700,
    recursive: true,
  });
  yield* fileSystem.writeFileString(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 }
  );

  yield* Console.log("");
  yield* Console.log(`History probe complete. Saved ${outputPath}`);
  if (failedResultCount > 0) {
    yield* Console.log(
      `${failedResultCount} dialog(s) had normalization failures. The failing messages and full diagnostics are in the JSON report.`
    );
  }
});

const probeCommand = Command.make("probe-history", {}, () => runProbe()).pipe(
  Command.withDescription(
    "Interactively fetch and save one bounded Telegram history page per selected dialog."
  )
);

Command.run(probeCommand, { version: packageJson.version }).pipe(
  Effect.scoped,
  Effect.provide([telegramProbeLayer, BunServices.layer]),
  BunRuntime.runMain
);
