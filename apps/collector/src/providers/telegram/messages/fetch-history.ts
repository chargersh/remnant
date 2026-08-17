import bigInt from "big-integer";
import { Context, Data, Effect, Layer } from "effect";
import { Api } from "telegram";
import type { EntityLike } from "telegram/define";
import { TelegramClient } from "@/providers/telegram/client/client";
import {
  classifyTelegramError,
  type TelegramFailure,
  type TelegramSafePeerContext,
} from "@/providers/telegram/error-classifier";

export const TELEGRAM_HISTORY_PAGE_MAX_SIZE = 100;

export interface TelegramHistoryPageRequest {
  readonly limit?: number;
  readonly maxId?: number;
  readonly minId?: number;
  readonly offsetDate?: number;
  readonly offsetId?: number;
  readonly peer: EntityLike;
  /** Safe peer identity used only for diagnostics; never pass an access hash. */
  readonly peerContext?: TelegramSafePeerContext;
}

export interface TelegramHistoryPage {
  readonly chats: readonly Api.TypeChat[];
  readonly estimatedMessageCount: number;
  readonly messageCountIsInexact: boolean;
  readonly messages: readonly Api.TypeMessage[];
  readonly nextOffsetId?: number;
  readonly raw: Api.messages.TypeMessages;
  readonly topics: readonly Api.TypeForumTopic[];
  readonly users: readonly Api.TypeUser[];
}

export class TelegramHistoryRequestError extends Data.TaggedError(
  "TelegramHistoryRequestError"
)<{
  readonly reason: "invalidLimit" | "unexpectedNotModified";
}> {}

export class TelegramHistoryFetchError extends Data.TaggedError(
  "TelegramHistoryFetchError"
)<{
  readonly failure: TelegramFailure;
}> {}

export type TelegramHistoryError =
  | TelegramHistoryFetchError
  | TelegramHistoryRequestError;

export const decodeTelegramHistoryPage = Effect.fn(
  "TelegramHistory.decodePage"
)(function* (result: Api.messages.TypeMessages) {
  if (result instanceof Api.messages.MessagesNotModified) {
    return yield* new TelegramHistoryRequestError({
      reason: "unexpectedNotModified",
    });
  }

  const messages = result.messages;
  const oldestMessageId = messages.reduce<number | undefined>(
    (oldest, message) =>
      message.id > 0 && (oldest === undefined || message.id < oldest)
        ? message.id
        : oldest,
    undefined
  );
  const isCompleteResult = result instanceof Api.messages.Messages;

  return {
    chats: result.chats,
    estimatedMessageCount: isCompleteResult ? messages.length : result.count,
    messageCountIsInexact:
      result instanceof Api.messages.MessagesSlice ||
      result instanceof Api.messages.ChannelMessages
        ? result.inexact === true
        : false,
    messages,
    ...(!isCompleteResult && oldestMessageId !== undefined
      ? { nextOffsetId: oldestMessageId }
      : {}),
    raw: result,
    topics: result instanceof Api.messages.ChannelMessages ? result.topics : [],
    users: result.users,
  } satisfies TelegramHistoryPage;
});

export interface TelegramHistoryShape {
  readonly fetchPage: (
    request: TelegramHistoryPageRequest
  ) => Effect.Effect<TelegramHistoryPage, TelegramHistoryError>;
}

export class TelegramHistory extends Context.Service<
  TelegramHistory,
  TelegramHistoryShape
>()("remnant/collector/TelegramHistory") {
  static readonly layer = Layer.effect(
    TelegramHistory,
    Effect.gen(function* () {
      const client = yield* TelegramClient;

      const fetchPage = Effect.fn("TelegramHistory.fetchPage")(function* (
        request: TelegramHistoryPageRequest
      ) {
        const limit = request.limit ?? TELEGRAM_HISTORY_PAGE_MAX_SIZE;

        if (
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > TELEGRAM_HISTORY_PAGE_MAX_SIZE
        ) {
          return yield* new TelegramHistoryRequestError({
            reason: "invalidLimit",
          });
        }

        const result = yield* Effect.tryPromise({
          try: () =>
            client.invoke(
              new Api.messages.GetHistory({
                addOffset: 0,
                hash: bigInt.zero,
                limit,
                maxId: request.maxId ?? 0,
                minId: request.minId ?? 0,
                offsetDate: request.offsetDate ?? 0,
                offsetId: request.offsetId ?? 0,
                peer: request.peer,
              })
            ),
          catch: (cause) =>
            classifyTelegramError(cause, {
              operation: "historyFetch",
              ...(request.peerContext ? { peer: request.peerContext } : {}),
              requestConstructor: "messages.GetHistory",
            }),
        }).pipe(
          Effect.catch((failure) =>
            failure.summary.category === "cancelled"
              ? Effect.interrupt
              : new TelegramHistoryFetchError({ failure })
          )
        );

        return yield* decodeTelegramHistoryPage(result);
      });

      return { fetchPage };
    })
  );
}
