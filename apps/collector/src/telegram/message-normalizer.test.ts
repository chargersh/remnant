import { describe, expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import bigInt from "big-integer";
import { Effect } from "effect";
import { Api } from "telegram";
import {
  normalizeTelegramMessage,
  normalizeTelegramMessageContent,
} from "./message-normalizer";
import {
  makeDocumentMessageFixture,
  makeEmptyMessageFixture,
  makePhotoMessageFixture,
  makeServiceMessageFixture,
  makeTextMessageFixture,
} from "./test-fixtures";

const observedAt = 1_800_000_000_000;
const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const runNormalize = (source: Parameters<typeof normalizeTelegramMessage>[0]) =>
  Effect.runPromise(
    normalizeTelegramMessage(source, {
      accountPeerId: "1",
      observedAt,
    }).pipe(Effect.provide(BunCrypto.layer))
  );

describe("normalizeTelegramMessage", () => {
  test("preserves text entity UTF-16 offsets and long identifiers", async () => {
    const result = await runNormalize(makeTextMessageFixture());

    expect(result.message.kind).toBe("message");
    if (result.message.kind !== "message") {
      throw new Error("Expected an ordinary message");
    }

    expect(result.message.entities).toEqual([
      {
        length: 5,
        offset: 0,
        telegramConstructor: "MessageEntityBold",
        type: "bold",
      },
      {
        documentId: "90071992547409930",
        length: 2,
        offset: 6,
        telegramConstructor: "MessageEntityCustomEmoji",
        type: "customEmoji",
      },
    ]);
    expect(result.message.peer).toEqual({ peerId: "84", peerKind: "user" });
    expect(result.semanticHash).toMatch(SHA_256_HEX_PATTERN);
  });

  test("accepts nullable fields and infers private-chat senders", async () => {
    const source = makeTextMessageFixture();
    for (const field of [
      "editDate",
      "forwards",
      "fromId",
      "fwdFrom",
      "groupedId",
      "media",
      "replies",
      "replyTo",
      "views",
    ]) {
      Reflect.set(source, field, null);
    }

    const result = await runNormalize(source);

    expect(result.message.peer).toEqual({
      peerId: "84",
      peerKind: "user",
    });
    expect(result.message).toMatchObject({
      outgoing: false,
      sender: { peerId: "84", peerKind: "user" },
    });
    expect(result.message).not.toHaveProperty("editDate");
    expect(result.message).not.toHaveProperty("forward");
    expect(result.message).not.toHaveProperty("groupedId");
    expect(result.message).not.toHaveProperty("media");
    expect(result.message).not.toHaveProperty("reply");
    expect(result.message).toMatchObject({
      currentState: { pinned: false },
    });

    const outgoingSource = makeTextMessageFixture({ out: true });
    Reflect.set(outgoingSource, "fromId", null);
    const outgoingResult = await runNormalize(outgoingSource);

    expect(outgoingResult.message).toMatchObject({
      outgoing: true,
      sender: { peerId: "1", peerKind: "user" },
    });
  });

  test("discovers document bytes without downloading them", async () => {
    const result = await runNormalize(makeDocumentMessageFixture());

    expect(result.discoveredFiles).toEqual([
      {
        file: {
          accessHash: "90071992547409931",
          dcId: 2,
          expectedSize: "1024000",
          fileReferenceBase64: "AQID",
          mimeType: "video/mp4",
          originalFileName: "clip.mp4",
          presentation: "video",
          telegramFileId: "90071992547409932",
          telegramObjectKind: "document",
        },
        source: {
          mediaRole: "primary",
          peer: { peerId: "84", peerKind: "user" },
          telegramMessageId: 101,
          type: "messageMedia",
        },
      },
    ]);
  });

  test("normalizes service and empty constructors", async () => {
    const service = await runNormalize(makeServiceMessageFixture());
    const empty = await runNormalize(makeEmptyMessageFixture());

    expect(service.message.kind).toBe("service");
    expect(empty.message).toMatchObject({
      kind: "empty",
      peer: { peerId: "9", peerKind: "channel" },
      telegramMessageId: 103,
    });
  });

  test("volatile counters do not change the semantic hash", async () => {
    const first = await runNormalize(makeTextMessageFixture({ views: 10 }));
    const second = await runNormalize(makeTextMessageFixture({ views: 999 }));
    const edited = await runNormalize(
      makeTextMessageFixture({ message: "changed 😀" })
    );

    expect(first.semanticHash).toBe(second.semanticHash);
    expect(first.semanticHash).not.toBe(edited.semanticHash);
  });

  test("operational file references do not change the semantic hash", async () => {
    const first = await runNormalize(
      makeDocumentMessageFixture([], {
        accessHash: bigInt(1),
        fileReference: Buffer.from([1, 2, 3]),
      })
    );
    const refreshed = await runNormalize(
      makeDocumentMessageFixture([], {
        accessHash: bigInt(2),
        fileReference: Buffer.from([9, 8, 7]),
      })
    );

    expect(first.discoveredFiles).not.toEqual(refreshed.discoveredFiles);
    expect(first.semanticHash).toBe(refreshed.semanticHash);
  });

  test("preserves timed and view-once semantics without touching media", async () => {
    const timed = await runNormalize(makePhotoMessageFixture(30));
    const viewOnce = await runNormalize(makePhotoMessageFixture(0x7f_ff_ff_ff));

    expect(timed.message).toMatchObject({
      media: {
        ephemeral: {
          mode: "timed",
          preservationResult: "pending",
          ttlSeconds: 30,
        },
      },
    });
    expect(viewOnce.message).toMatchObject({
      media: {
        ephemeral: {
          mode: "viewOnce",
          preservationResult: "pending",
        },
      },
    });
  });

  test("propagates warnings from unsupported reply quote entities", async () => {
    const result = await runNormalize(
      makeTextMessageFixture({
        replyTo: new Api.MessageReplyHeader({
          quoteEntities: [
            new Api.MessageEntityUnknown({ length: 5, offset: 0 }),
          ],
          quoteText: "quote",
          replyToMsgId: 99,
        }),
      })
    );

    expect(result.message).toMatchObject({
      kind: "message",
      reply: {
        quoteEntities: [
          {
            length: 5,
            offset: 0,
            telegramConstructor: "MessageEntityUnknown",
            type: "unknown",
          },
        ],
        quoteText: "quote",
        replyToMessageId: 99,
      },
    });
    expect(result.warnings).toContainEqual({
      code: "unsupportedEntity",
      telegramConstructor: "MessageEntityUnknown",
    });
  });

  test("keeps photo download size and source identity", async () => {
    const result = await runNormalize(makePhotoMessageFixture());

    expect(result.discoveredFiles).toEqual([
      expect.objectContaining({
        file: expect.objectContaining({
          telegramObjectKind: "photo",
          thumbSize: "x",
        }),
        source: {
          mediaRole: "primary",
          peer: { peerId: "84", peerKind: "user" },
          telegramMessageId: 104,
          type: "messageMedia",
        },
      }),
    ]);
  });

  test("content normalization is deterministic without clock access", async () => {
    const source = makeTextMessageFixture();
    const first = await Effect.runPromise(
      normalizeTelegramMessageContent(source, {
        accountPeerId: "1",
        observedAt,
      })
    );
    const second = await Effect.runPromise(
      normalizeTelegramMessageContent(source, {
        accountPeerId: "1",
        observedAt,
      })
    );

    expect(first).toEqual(second);
  });
});
