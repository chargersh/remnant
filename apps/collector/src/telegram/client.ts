import { Context, Data, Effect, Layer } from "effect";
import { TelegramClient as GramJsTelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

type TelegramClientParams = ConstructorParameters<
  typeof GramJsTelegramClient
>[3];

export interface TelegramClientConfig {
  readonly apiHash: string;
  readonly apiId: number;
  readonly clientParams?: TelegramClientParams;
  readonly session: string | StringSession;
}

export class TelegramClientCreationError extends Data.TaggedError(
  "TelegramClientCreationError"
)<{
  readonly cause: unknown;
}> {}

export class TelegramConnectionError extends Data.TaggedError(
  "TelegramConnectionError"
)<{
  readonly cause: unknown;
}> {}

class TelegramDisconnectionError extends Data.TaggedError(
  "TelegramDisconnectionError"
)<{
  readonly cause: unknown;
}> {}

export class TelegramAuthorizationCheckError extends Data.TaggedError(
  "TelegramAuthorizationCheckError"
)<{
  readonly cause: unknown;
}> {}

export class TelegramSessionUnauthorizedError extends Data.TaggedError(
  "TelegramSessionUnauthorizedError"
) {}

export type TelegramClientError =
  | TelegramAuthorizationCheckError
  | TelegramClientCreationError
  | TelegramConnectionError
  | TelegramSessionUnauthorizedError;

export class TelegramClient extends Context.Service<
  TelegramClient,
  GramJsTelegramClient
>()("remnant/collector/TelegramClient") {}

const createClient = (config: TelegramClientConfig) =>
  Effect.try({
    try: () =>
      new GramJsTelegramClient(
        typeof config.session === "string"
          ? new StringSession(config.session)
          : config.session,
        config.apiId,
        config.apiHash,
        config.clientParams ?? {}
      ),
    catch: (cause) => new TelegramClientCreationError({ cause }),
  });

const disconnectClient = (client: GramJsTelegramClient) =>
  Effect.tryPromise({
    try: () => client.disconnect(),
    catch: (cause) => new TelegramDisconnectionError({ cause }),
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Failed to disconnect the Telegram client cleanly", {
        cause: error.cause,
      })
    )
  );

export const makeTelegramClientResource = Effect.fn(
  "TelegramClient.makeResource"
)(function* (config: TelegramClientConfig) {
  return yield* Effect.acquireRelease(createClient(config), disconnectClient);
});

export const makeTelegramClient = Effect.fn("TelegramClient.make")(function* (
  config: TelegramClientConfig
) {
  const client = yield* makeTelegramClientResource(config);

  const connected = yield* Effect.tryPromise({
    try: () => client.connect(),
    catch: (cause) => new TelegramConnectionError({ cause }),
  });

  if (!connected) {
    return yield* new TelegramConnectionError({
      cause: "GramJS did not establish a Telegram connection.",
    });
  }

  const isAuthorized = yield* Effect.tryPromise({
    try: () => client.checkAuthorization(),
    catch: (cause) => new TelegramAuthorizationCheckError({ cause }),
  });

  if (!isAuthorized) {
    return yield* new TelegramSessionUnauthorizedError();
  }

  return client;
});

export const telegramClientLayer = (
  config: TelegramClientConfig
): Layer.Layer<TelegramClient, TelegramClientError> =>
  Layer.effect(TelegramClient)(makeTelegramClient(config));
