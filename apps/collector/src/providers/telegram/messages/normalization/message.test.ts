import { describe, expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import bigInt from "big-integer";
import { Effect } from "effect";
import { Api } from "telegram";
import { encodeTelegramRawValue } from "@/providers/telegram/serialization/raw-value";
import {
  makeDocumentMessageFixture,
  makeEmptyMessageFixture,
  makeGroupCallServiceMessageFixture,
  makePaidMediaMessageFixture,
  makePhoneCallServiceMessageFixture,
  makePhotoMessageFixture,
  makeServiceMessageFixture,
  makeTextMessageFixture,
} from "@/providers/telegram/testing/fixtures";
import {
  normalizeTelegramMessage,
  normalizeTelegramMessageContent,
} from "./message";

const observedAt = 1_800_000_000_000;
const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const runNormalize = (source: Parameters<typeof normalizeTelegramMessage>[0]) =>
  Effect.runPromise(
    normalizeTelegramMessage(source, {
      accountPeerId: "1",
      observedAt,
    }).pipe(Effect.provide(BunCrypto.layer))
  );

const requireDocumentMedia = (
  source: ReturnType<typeof makeDocumentMessageFixture>
) => {
  if (!(source.media instanceof Api.MessageMediaDocument)) {
    throw new Error("Expected document media fixture");
  }

  return source.media;
};

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

  test("normalizes phone calls as metadata without discovering recordings", async () => {
    const result = await runNormalize(
      makePhoneCallServiceMessageFixture(
        {
          duration: 42,
          reason: new Api.PhoneCallDiscardReasonHangup(),
          video: true,
        },
        { out: true }
      )
    );

    expect(result.message).toMatchObject({
      action: {
        callId: "90071992547409935",
        durationSeconds: 42,
        mode: "video",
        reason: {
          telegramConstructor: "PhoneCallDiscardReasonHangup",
          type: "hangup",
        },
        telegramConstructor: "MessageActionPhoneCall",
        type: "phoneCall",
      },
      kind: "service",
      outgoing: true,
    });
    expect(result.discoveredFiles).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("normalizes every installed phone-call discard reason without exposing keys", async () => {
    const cases = [
      [new Api.PhoneCallDiscardReasonMissed(), "missed"],
      [new Api.PhoneCallDiscardReasonDisconnect(), "disconnected"],
      [new Api.PhoneCallDiscardReasonHangup(), "hangup"],
      [new Api.PhoneCallDiscardReasonBusy(), "busy"],
      [
        new Api.PhoneCallDiscardReasonAllowGroupCall({
          encryptedKey: Buffer.from("private call key"),
        }),
        "allowGroupCall",
      ],
    ] as const;

    for (const [reason, expectedType] of cases) {
      const result = await runNormalize(
        makePhoneCallServiceMessageFixture({ reason })
      );

      expect(result.message).toMatchObject({
        action: {
          mode: "audio",
          reason: {
            telegramConstructor: reason.className,
            type: expectedType,
          },
          type: "phoneCall",
        },
        kind: "service",
        outgoing: false,
      });
      expect(result.discoveredFiles).toEqual([]);
      expect(JSON.stringify(result.message)).not.toContain("private call key");
      expect(JSON.stringify(result.message)).not.toContain("encryptedKey");
    }

    const rawAllowGroupCall = await Effect.runPromise(
      encodeTelegramRawValue(cases[4][0])
    );

    expect(rawAllowGroupCall).toEqual({
      $type: "telegramConstructor",
      constructor: "PhoneCallDiscardReasonAllowGroupCall",
      fields: {
        encryptedKey: {
          $type: "bytes",
          base64: "cHJpdmF0ZSBjYWxsIGtleQ==",
        },
      },
    });
  });

  test("preserves absent phone-call metadata and hashes meaningful changes", async () => {
    const nullableSource = makePhoneCallServiceMessageFixture({
      duration: 12,
      reason: new Api.PhoneCallDiscardReasonMissed(),
    });
    Reflect.set(nullableSource.action, "duration", null);
    Reflect.set(nullableSource.action, "reason", null);

    const audio = await runNormalize(nullableSource);
    const video = await runNormalize(
      makePhoneCallServiceMessageFixture({ video: true })
    );

    expect(audio.message).toMatchObject({
      action: {
        callId: "90071992547409935",
        mode: "audio",
        type: "phoneCall",
      },
      kind: "service",
    });
    expect(audio.message).not.toHaveProperty("action.durationSeconds");
    expect(audio.message).not.toHaveProperty("action.reason");
    expect(audio.semanticHash).not.toBe(video.semanticHash);
  });

  test("normalizes started and ended group-call service actions", async () => {
    const call = new Api.InputGroupCall({
      accessHash: bigInt("90071992547409941"),
      id: bigInt("90071992547409940"),
    });
    const startedSource = makeGroupCallServiceMessageFixture(
      new Api.MessageActionGroupCall({ call })
    );
    const endedSource = makeGroupCallServiceMessageFixture(
      new Api.MessageActionGroupCall({ call, duration: 600 }),
      {
        fromId: new Api.PeerUser({ userId: bigInt(1) }),
        out: true,
      }
    );
    const nullableSource = makeGroupCallServiceMessageFixture(
      new Api.MessageActionGroupCall({ call, duration: 1 })
    );
    Reflect.set(nullableSource.action, "duration", null);

    const started = await runNormalize(startedSource);
    const ended = await runNormalize(endedSource);
    const nullable = await runNormalize(nullableSource);

    expect(started.message).toMatchObject({
      action: {
        callId: "90071992547409940",
        state: "started",
        telegramConstructor: "MessageActionGroupCall",
        type: "groupCall",
      },
      kind: "service",
      outgoing: false,
      sender: { peerId: "42", peerKind: "user" },
    });
    expect(started.message).not.toHaveProperty("action.durationSeconds");
    expect(ended.message).toMatchObject({
      action: {
        callId: "90071992547409940",
        durationSeconds: 600,
        state: "ended",
        type: "groupCall",
      },
      kind: "service",
      outgoing: true,
      sender: { peerId: "1", peerKind: "user" },
    });
    expect(nullable.message).toMatchObject({
      action: { state: "started", type: "groupCall" },
    });
    expect(nullable.message).not.toHaveProperty("action.durationSeconds");
    expect(started.discoveredFiles).toEqual([]);
    expect(ended.discoveredFiles).toEqual([]);
    expect(started.semanticHash).not.toBe(ended.semanticHash);
  });

  test("normalizes scheduled group calls and group-call invitations", async () => {
    const call = new Api.InputGroupCall({
      accessHash: bigInt("90071992547409941"),
      id: bigInt("90071992547409940"),
    });
    const scheduled = await runNormalize(
      makeGroupCallServiceMessageFixture(
        new Api.MessageActionGroupCallScheduled({
          call,
          scheduleDate: 1_700_003_600,
        })
      )
    );
    const invitation = await runNormalize(
      makeGroupCallServiceMessageFixture(
        new Api.MessageActionInviteToGroupCall({
          call,
          users: [bigInt("90071992547409942"), bigInt(43)],
        })
      )
    );

    expect(scheduled.message).toMatchObject({
      action: {
        callId: "90071992547409940",
        scheduledAt: 1_700_003_600_000,
        telegramConstructor: "MessageActionGroupCallScheduled",
        type: "groupCallScheduled",
      },
      kind: "service",
    });
    expect(invitation.message).toMatchObject({
      action: {
        callId: "90071992547409940",
        telegramConstructor: "MessageActionInviteToGroupCall",
        type: "groupCallInvitation",
        userIds: ["90071992547409942", "43"],
      },
      kind: "service",
    });
    expect(scheduled.discoveredFiles).toEqual([]);
    expect(invitation.discoveredFiles).toEqual([]);
  });

  test("keeps group-call access hashes only in raw preservation", async () => {
    const call = new Api.InputGroupCall({
      accessHash: bigInt("90071992547409941"),
      id: bigInt("90071992547409940"),
    });
    const normalized = await runNormalize(
      makeGroupCallServiceMessageFixture(
        new Api.MessageActionGroupCall({ call })
      )
    );
    const rawCall = await Effect.runPromise(encodeTelegramRawValue(call));

    expect(JSON.stringify(normalized.message)).not.toContain("accessHash");
    expect(JSON.stringify(normalized.message)).not.toContain(
      "90071992547409941"
    );
    expect(rawCall).toEqual({
      $type: "telegramConstructor",
      constructor: "InputGroupCall",
      fields: {
        accessHash: { $type: "long", value: "90071992547409941" },
        id: { $type: "long", value: "90071992547409940" },
      },
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

  test("normalizes observed paid-media previews without unlocking them", async () => {
    const result = await runNormalize(makePaidMediaMessageFixture());

    expect(result.message).toMatchObject({
      kind: "message",
      media: {
        itemCount: 3,
        items: [
          {
            height: 2560,
            state: "lockedPreview",
            telegramConstructor: "MessageExtendedMediaPreview",
            thumbnail: {
              bytesBase64: "AQID",
              size: 3,
              telegramConstructor: "PhotoStrippedSize",
              type: "i",
            },
            width: 1920,
          },
          { height: 2208, state: "lockedPreview", width: 1242 },
          { height: 2208, state: "lockedPreview", width: 1242 },
        ],
        starsAmount: "88",
        telegramConstructor: "MessageMediaPaidMedia",
        telegramType: "paidMedia",
      },
    });
    expect(result.discoveredFiles).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("preserves paid video previews, cached bytes, and nullable fields", async () => {
    const nullablePreview = new Api.MessageExtendedMediaPreview({
      h: 720,
      thumb: new Api.PhotoCachedSize({
        bytes: Buffer.from([7, 8, 9]),
        h: 90,
        type: "m",
        w: 160,
      }),
      videoDuration: 12,
      w: 1280,
    });
    Reflect.set(nullablePreview, "h", null);
    Reflect.set(nullablePreview, "w", null);
    const result = await runNormalize(
      makePaidMediaMessageFixture([nullablePreview])
    );

    expect(result.message).toMatchObject({
      media: {
        items: [
          {
            state: "lockedPreview",
            thumbnail: {
              bytesBase64: "BwgJ",
              height: 90,
              size: 3,
              telegramConstructor: "PhotoCachedSize",
              type: "m",
              width: 160,
            },
            videoDurationSeconds: 12,
          },
        ],
        telegramType: "paidMedia",
      },
    });
    expect(result.message).not.toHaveProperty("media.items.0.height");
    expect(result.message).not.toHaveProperty("media.items.0.width");
  });

  test("normalizes available paid media and discovers downloadable files", async () => {
    const preview = new Api.MessageExtendedMediaPreview({ h: 480, w: 640 });
    const firstDocument = requireDocumentMedia(makeDocumentMessageFixture());
    const refreshedDocument = requireDocumentMedia(
      makeDocumentMessageFixture(undefined, {
        accessHash: bigInt(2),
        fileReference: Buffer.from([9, 8, 7]),
      })
    );
    const mixed = await runNormalize(
      makePaidMediaMessageFixture([
        preview,
        new Api.MessageExtendedMedia({ media: firstDocument }),
      ])
    );
    const available = await runNormalize(
      makePaidMediaMessageFixture([
        new Api.MessageExtendedMedia({ media: firstDocument }),
      ])
    );
    const refreshed = await runNormalize(
      makePaidMediaMessageFixture([
        new Api.MessageExtendedMedia({ media: refreshedDocument }),
      ])
    );

    expect(mixed.message).toMatchObject({
      media: {
        itemCount: 2,
        items: [
          { state: "lockedPreview" },
          {
            media: { telegramType: "document" },
            state: "availableMedia",
            telegramConstructor: "MessageExtendedMedia",
          },
        ],
        telegramType: "paidMedia",
      },
    });
    expect(mixed.discoveredFiles).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ paidMediaItemIndex: 1 }),
      }),
    ]);
    expect(available.discoveredFiles).toHaveLength(1);
    expect(available.discoveredFiles).not.toEqual(refreshed.discoveredFiles);
    expect(available.semanticHash).toBe(refreshed.semanticHash);
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
