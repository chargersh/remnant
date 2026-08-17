import { env } from "@remnant/env/collector";
import { Context, Data, Effect, Layer } from "effect";

export class TelegramSessionNotConfiguredError extends Data.TaggedError(
  "TelegramSessionNotConfiguredError"
)<{
  readonly variable: "TELEGRAM_SESSION";
}> {}

export class TelegramSessionStore extends Context.Service<
  TelegramSessionStore,
  {
    readonly isConfigured: Effect.Effect<boolean>;
    readonly require: Effect.Effect<string, TelegramSessionNotConfiguredError>;
  }
>()("remnant/collector/TelegramSessionStore") {}

export const makeTelegramSessionStore = (
  session: string | undefined
): TelegramSessionStore["Service"] => ({
  isConfigured: Effect.succeed(session !== undefined),
  require:
    session === undefined
      ? Effect.fail(
          new TelegramSessionNotConfiguredError({
            variable: "TELEGRAM_SESSION",
          })
        )
      : Effect.succeed(session),
});

export const telegramSessionStoreLayer: Layer.Layer<TelegramSessionStore> =
  Layer.succeed(
    TelegramSessionStore,
    makeTelegramSessionStore(env.TELEGRAM_SESSION)
  );
