import { describe, expect, test } from "bun:test";
import bigInt from "big-integer";
import { Effect, Exit, Layer, Redacted } from "effect";
import { Api, type TelegramClient as GramJsTelegramClient } from "telegram";
import { BadRequestError, ReadCancelledError } from "telegram/errors";
import { TelegramClient } from "@/providers/telegram/client/client";
import {
  makeEmptyMessageFixture,
  makeTextMessageFixture,
} from "@/providers/telegram/testing/fixtures";
import { decodeTelegramHistoryPage, TelegramHistory } from "./fetch-page";

describe("decodeTelegramHistoryPage", () => {
  test("retains estimate metadata and derives the next older cursor", async () => {
    const result = new Api.messages.MessagesSlice({
      count: 5000,
      inexact: true,
      chats: [],
      messages: [
        makeTextMessageFixture({ id: 200 }),
        makeEmptyMessageFixture(),
        makeTextMessageFixture({ id: 150 }),
      ],
      users: [],
    });

    const page = await Effect.runPromise(decodeTelegramHistoryPage(result));

    expect(page.estimatedMessageCount).toBe(5000);
    expect(page.messageCountIsInexact).toBe(true);
    expect(page.nextOffsetId).toBe(103);
    expect(page.raw).toBe(result);
  });

  test("treats a complete Messages result as the end of history", async () => {
    const result = new Api.messages.Messages({
      chats: [],
      messages: [makeTextMessageFixture()],
      users: [],
    });

    const page = await Effect.runPromise(decodeTelegramHistoryPage(result));

    expect(page.estimatedMessageCount).toBe(1);
    expect(page.nextOffsetId).toBeUndefined();
  });

  test("wraps invoke failures with classified history context", async () => {
    const request = new Api.messages.GetHistory({
      addOffset: 0,
      hash: bigInt.zero,
      limit: 1,
      maxId: 0,
      minId: 0,
      offsetDate: 0,
      offsetId: 0,
      peer: new Api.InputPeerSelf(),
    });
    const cause = new BadRequestError("FILE_REFERENCE_EXPIRED", request, 400);
    const client = {
      invoke: () => Promise.reject(cause),
    } as unknown as GramJsTelegramClient;
    const layer = TelegramHistory.layer.pipe(
      Layer.provide(Layer.succeed(TelegramClient, client))
    );
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const history = yield* TelegramHistory;
        return yield* history.fetchPage({
          peer: new Api.InputPeerSelf(),
          peerContext: { id: "123", kind: "user" },
        });
      }).pipe(Effect.flip, Effect.provide(layer))
    );

    expect(error).toMatchObject({
      _tag: "TelegramHistoryFetchError",
      failure: {
        summary: {
          category: "fileReferenceExpired",
          operation: "historyFetch",
          peer: { id: "123", kind: "user" },
          requestConstructor: "messages.GetHistory",
          safeCode: "FILE_REFERENCE_EXPIRED",
        },
      },
    });
    if (error._tag === "TelegramHistoryFetchError") {
      expect(Redacted.value(error.failure.cause)).toBe(cause);
    }
  });

  test("preserves rejected cancellation as Effect interruption", async () => {
    const client = {
      invoke: () => Promise.reject(new ReadCancelledError()),
    } as unknown as GramJsTelegramClient;
    const layer = TelegramHistory.layer.pipe(
      Layer.provide(Layer.succeed(TelegramClient, client))
    );
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const history = yield* TelegramHistory;
        return yield* history.fetchPage({ peer: new Api.InputPeerSelf() });
      }).pipe(Effect.provide(layer))
    );

    expect(Exit.hasInterrupts(exit)).toBe(true);
  });
});
