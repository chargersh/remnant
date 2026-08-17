import { Data, Effect } from "effect";
import { syncTelegramDialogs } from "@/persistence/convex/telegram-dialogs";
import { TelegramClient } from "@/providers/telegram/client/client";
import { getTelegramDialogs } from "@/providers/telegram/dialogs/dialogs";
import {
  classifyTelegramError,
  type TelegramFailure,
} from "@/providers/telegram/error-classifier";

export class TelegramAccountLookupError extends Data.TaggedError(
  "TelegramAccountLookupError"
)<{
  readonly failure: TelegramFailure;
}> {}

export const collectAndSyncTelegramDialogs = Effect.fn(
  "TelegramDialogSync.collectAndSync"
)(function* () {
  const client = yield* TelegramClient;
  const account = yield* Effect.tryPromise({
    try: () => client.getMe(),
    catch: (cause) =>
      classifyTelegramError(cause, {
        operation: "selfLookup",
        requestConstructor: "users.GetUsers",
      }),
  }).pipe(
    Effect.catch((failure) =>
      failure.summary.category === "cancelled"
        ? Effect.interrupt
        : new TelegramAccountLookupError({ failure })
    )
  );
  const displayName = [account.firstName, account.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const dialogs = yield* getTelegramDialogs();

  return yield* syncTelegramDialogs(
    {
      displayName: displayName || account.username || account.id.toString(),
      telegramAccountId: account.id.toString(),
      ...(account.username === undefined ? {} : { username: account.username }),
    },
    dialogs
  );
});
