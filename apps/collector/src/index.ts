import { BunRuntime } from "@effect/platform-bun";
import { env } from "@remnant/env/collector";
import { Effect, Layer } from "effect";
import { collectAndSyncTelegramDialogs } from "./convex/dialog-sync";
import {
  type TelegramClient,
  type TelegramClientError,
  telegramClientLayer,
} from "./telegram/client";
import {
  type TelegramSessionNotConfiguredError,
  TelegramSessionStore,
  telegramSessionStoreLayer,
} from "./telegram/session-store";

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
  yield* Effect.logInfo("Starting Telegram dialog synchronization");

  const result = yield* collectAndSyncTelegramDialogs();

  yield* Effect.logInfo("Telegram dialog synchronization submitted", result);
});

const collectorLayer = telegramClientFromSessionLayer.pipe(
  Layer.provide(telegramSessionStoreLayer)
);

collectorProgram.pipe(Effect.provide(collectorLayer), BunRuntime.runMain);
