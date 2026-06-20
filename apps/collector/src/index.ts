import { BunRuntime } from "@effect/platform-bun";
import { env } from "@remnant/env/collector";
import { Data, Effect, Layer } from "effect";
import {
  TelegramClient,
  type TelegramClientError,
  telegramClientLayer,
} from "./telegram/client";
import { getTelegramDialogs } from "./telegram/dialogs";
import {
  type TelegramSessionNotConfiguredError,
  TelegramSessionStore,
  telegramSessionStoreLayer,
} from "./telegram/session-store";

export class TelegramAccountLookupError extends Data.TaggedError(
  "TelegramAccountLookupError"
)<{
  readonly cause: unknown;
}> {}

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

const collectorProgram = Effect.gen(function* () {
  const client = yield* TelegramClient;
  const account = yield* Effect.tryPromise({
    try: () => client.getMe(),
    catch: (cause) => new TelegramAccountLookupError({ cause }),
  });
  const displayName = [account.firstName, account.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

  yield* Effect.logInfo("Telegram collector connected", {
    accountId: account.id.toString(),
    displayName: displayName || "Unknown",
    username: account.username ?? "none",
  });

  const dialogs = yield* getTelegramDialogs({ limit: 40 });
  const counts = { channel: 0, group: 0, user: 0 };

  for (const dialog of dialogs) {
    counts[dialog.type] += 1;
  }

  yield* Effect.logInfo("Telegram dialogs loaded", {
    ...counts,
    total: dialogs.length,
  });

  yield* Effect.forEach(
    dialogs,
    (dialog) =>
      Effect.logInfo("Telegram dialog", {
        archived: dialog.archived,
        dialogId: dialog.dialogId,
        name: dialog.name,
        peerId: dialog.peerId,
        peerKind: dialog.peerKind,
        pinned: dialog.pinned,
        type: dialog.type,
        unreadCount: dialog.unreadCount,
        username: "username" in dialog ? (dialog.username ?? "none") : "none",
      }),
    { discard: true }
  );
});

const collectorLayer = telegramClientFromSessionLayer.pipe(
  Layer.provide(telegramSessionStoreLayer)
);

collectorProgram.pipe(Effect.provide(collectorLayer), BunRuntime.runMain);
