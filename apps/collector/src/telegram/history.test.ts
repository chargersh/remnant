import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { Api } from "telegram";
import { decodeTelegramHistoryPage } from "./history";
import {
  makeEmptyMessageFixture,
  makeTextMessageFixture,
} from "./test-fixtures";

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
});
