import { Context, Data, Effect, Layer } from "effect";
import { TelegramClient as GramJsTelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import {
  classifyTelegramError,
  type TelegramFailure,
} from "@/providers/telegram/error-classifier";

type TelegramClientParams = ConstructorParameters<
  typeof GramJsTelegramClient
>[3];

export interface TelegramClientConfig {
  readonly apiHash: string;
  readonly apiId: number;
  readonly clientParams?: TelegramClientParams;
  readonly session: string | StringSession;
}

/**
 * GramJS owns a small number of immediate retries. Durable Effect workers own
 * scheduling after a classified failure escapes. In particular, GramJS must
 * not occupy a worker by sleeping through a Telegram flood wait.
 */
export const TELEGRAM_CLIENT_RETRY_DEFAULTS = {
  connectionRetries: 5,
  downloadRetries: 3,
  floodSleepThreshold: 0,
  reconnectRetries: 5,
  requestRetries: 3,
} as const satisfies TelegramClientParams;

export class TelegramClientCreationError extends Data.TaggedError(
  "TelegramClientCreationError"
)<{
  readonly failure: TelegramFailure;
}> {}

export class TelegramConnectionError extends Data.TaggedError(
  "TelegramConnectionError"
)<{
  readonly failure: TelegramFailure;
}> {}

class TelegramDisconnectionError extends Data.TaggedError(
  "TelegramDisconnectionError"
)<{
  readonly failure: TelegramFailure;
}> {}

export class TelegramAuthorizationCheckError extends Data.TaggedError(
  "TelegramAuthorizationCheckError"
)<{
  readonly failure: TelegramFailure;
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
        {
          ...TELEGRAM_CLIENT_RETRY_DEFAULTS,
          ...config.clientParams,
        }
      ),
    catch: (cause) =>
      new TelegramClientCreationError({
        failure: classifyTelegramError(cause, {
          operation: "clientCreation",
        }),
      }),
  });

const disconnectClient = (client: GramJsTelegramClient) =>
  Effect.tryPromise({
    try: () => client.disconnect(),
    catch: (cause) =>
      new TelegramDisconnectionError({
        failure: classifyTelegramError(cause, {
          operation: "clientDisconnect",
        }),
      }),
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Failed to disconnect the Telegram client cleanly", {
        error: error.failure.summary,
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

  yield* Effect.tryPromise({
    try: () => client.connect(),
    catch: (cause) =>
      new TelegramConnectionError({
        failure: classifyTelegramError(cause, {
          operation: "clientConnect",
        }),
      }),
  });

  if (!client.connected) {
    return yield* new TelegramConnectionError({
      failure: classifyTelegramError(new Error("Not connected"), {
        operation: "clientConnect",
      }),
    });
  }

  const isAuthorized = yield* Effect.tryPromise({
    try: () => client.checkAuthorization(),
    catch: (cause) =>
      new TelegramAuthorizationCheckError({
        failure: classifyTelegramError(cause, {
          operation: "authorizationCheck",
          requestConstructor: "updates.GetState",
        }),
      }),
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
