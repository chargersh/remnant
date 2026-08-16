import { Effect } from "effect";
import { Api } from "telegram";
import { normalizeTelegramEntities } from "./entity-normalizer";
import { normalizeTelegramMedia } from "./media-normalizer";
import type {
  TelegramForward,
  TelegramMessage,
  TelegramMessageEnvelope,
  TelegramReply,
} from "./message-contracts";
import { normalizeTelegramPeer } from "./peer-normalizer";
import {
  hashTelegramSemanticContent,
  TELEGRAM_SEMANTIC_HASH_VERSION,
} from "./semantic-hash";
import { normalizeTelegramServiceAction } from "./service-action-normalizer";

export interface NormalizeTelegramMessageOptions {
  readonly observedAt: number;
  readonly rawSourceBatchId?: string;
}

const optionalPeer = (peer: Api.TypePeer | undefined) =>
  peer === undefined ? Effect.succeed(undefined) : normalizeTelegramPeer(peer);

const normalizeReply = Effect.fn("TelegramReply.normalize")(function* (
  reply: Api.MessageReplyHeader | undefined
) {
  if (reply === undefined) {
    return;
  }

  const replyToPeer = yield* optionalPeer(reply.replyToPeerId);
  const quote = normalizeTelegramEntities(reply.quoteEntities);

  return {
    forumTopic: reply.forumTopic === true,
    ...(quote.entities.length === 0 ? {} : { quoteEntities: quote.entities }),
    ...(reply.quoteOffset === undefined
      ? {}
      : { quoteOffset: reply.quoteOffset }),
    ...(reply.quoteText === undefined ? {} : { quoteText: reply.quoteText }),
    ...(reply.replyToMsgId === undefined
      ? {}
      : { replyToMessageId: reply.replyToMsgId }),
    ...(replyToPeer === undefined ? {} : { replyToPeer }),
    ...(reply.replyToTopId === undefined
      ? {}
      : { replyToTopId: reply.replyToTopId }),
  } satisfies TelegramReply;
});

const normalizeForward = Effect.fn("TelegramForward.normalize")(function* (
  forward: Api.TypeMessageFwdHeader | undefined
) {
  if (!(forward instanceof Api.MessageFwdHeader)) {
    return;
  }

  const fromPeer = yield* optionalPeer(forward.fromId);
  const savedFromPeer = yield* optionalPeer(forward.savedFromPeer);

  return {
    ...(forward.channelPost === undefined
      ? {}
      : { channelPost: forward.channelPost }),
    date: forward.date * 1000,
    ...(forward.fromName === undefined ? {} : { fromName: forward.fromName }),
    ...(fromPeer === undefined ? {} : { fromPeer }),
    imported: forward.imported === true,
    ...(forward.postAuthor === undefined
      ? {}
      : { postAuthor: forward.postAuthor }),
    ...(forward.savedFromMsgId === undefined
      ? {}
      : { savedFromMessageId: forward.savedFromMsgId }),
    ...(savedFromPeer === undefined ? {} : { savedFromPeer }),
  } satisfies TelegramForward;
});

export const normalizeTelegramMessageContent = Effect.fn(
  "TelegramMessage.normalizeContent"
)(function* (
  source: Api.TypeMessage,
  options: NormalizeTelegramMessageOptions
) {
  const peer = yield* optionalPeer(source.peerId);
  const base = {
    firstObservedAt: options.observedAt,
    ...(peer === undefined ? {} : { peer }),
    ...(options.rawSourceBatchId === undefined
      ? {}
      : { rawSourceBatchId: options.rawSourceBatchId }),
    telegramMessageId: source.id,
  };

  if (source instanceof Api.MessageEmpty) {
    return {
      discoveredFiles: [],
      message: {
        ...base,
        kind: "empty",
      },
      warnings: [],
    } as const;
  }

  const sender = yield* optionalPeer(source.fromId);

  if (source instanceof Api.MessageService) {
    const action = normalizeTelegramServiceAction(source.action);

    return {
      discoveredFiles: [],
      message: {
        ...base,
        action: action.action,
        kind: "service",
        ...(sender === undefined ? {} : { sender }),
        sentAt: source.date * 1000,
      },
      warnings: action.warning === undefined ? [] : [action.warning],
    } as const;
  }

  const entities = normalizeTelegramEntities(source.entities);
  const media = normalizeTelegramMedia(source.media);
  const reply = yield* normalizeReply(source.replyTo);
  const forward = yield* normalizeForward(source.fwdFrom);

  return {
    discoveredFiles: media.files,
    message: {
      ...base,
      kind: "message",
      currentState: {
        ...(source.forwards === undefined ? {} : { forwards: source.forwards }),
        pinned: source.pinned === true,
        ...(source.replies === undefined
          ? {}
          : { replyCount: source.replies.replies }),
        ...(source.views === undefined ? {} : { views: source.views }),
      },
      ...(source.editDate === undefined
        ? {}
        : { editDate: source.editDate * 1000 }),
      entities: entities.entities,
      ...(forward === undefined ? {} : { forward }),
      ...(source.groupedId === undefined
        ? {}
        : { groupedId: source.groupedId.toString() }),
      ...(media.media === undefined ? {} : { media: media.media }),
      ...(reply === undefined ? {} : { reply }),
      ...(sender === undefined ? {} : { sender }),
      sentAt: source.date * 1000,
      text: source.message,
    },
    warnings: [...entities.warnings, ...media.warnings],
  } as const;
});

export const normalizeTelegramMessage = Effect.fn("TelegramMessage.normalize")(
  function* (
    source: Api.TypeMessage,
    options: NormalizeTelegramMessageOptions
  ) {
    const normalized = yield* normalizeTelegramMessageContent(source, options);
    const message: TelegramMessage = normalized.message;
    const semanticHash = yield* hashTelegramSemanticContent(message);

    return {
      ...normalized,
      message,
      semanticHash,
      semanticHashVersion: TELEGRAM_SEMANTIC_HASH_VERSION,
    } satisfies TelegramMessageEnvelope;
  }
);
