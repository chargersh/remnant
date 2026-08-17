import { describe, expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import { Effect } from "effect";
import { Api } from "telegram";
import {
  makeDocumentMessageFixture,
  makeTextMessageFixture,
} from "@/providers/telegram/testing/fixtures";
import { decodeTelegramHistoryPage } from "./fetch-page";
import { normalizeTelegramHistoryPage } from "./normalize-page";

describe("normalizeTelegramHistoryPage", () => {
  test("prepares one ordered raw and normalized preservation page", async () => {
    const source = new Api.messages.MessagesSlice({
      chats: [],
      count: 1000,
      messages: [makeTextMessageFixture(), makeDocumentMessageFixture()],
      users: [],
    });
    const program = Effect.gen(function* () {
      const page = yield* decodeTelegramHistoryPage(source);
      return yield* normalizeTelegramHistoryPage(page, {
        accountPeerId: "1",
        observedAt: 1_800_000_000_000,
        rawSourceBatchId: "raw-test-batch",
      });
    }).pipe(Effect.provide(BunCrypto.layer));

    const prepared = await Effect.runPromise(program);

    expect(
      prepared.messages.map(({ message }) => message.telegramMessageId)
    ).toEqual([100, 101]);
    expect(prepared.discoveredFiles).toHaveLength(1);
    expect(prepared.estimatedMessageCount).toBe(1000);
    expect(prepared.rawFormatVersion).toBe(1);
    expect(prepared.raw).toMatchObject({
      $type: "telegramConstructor",
      constructor: "messages.MessagesSlice",
    });
  });
});
