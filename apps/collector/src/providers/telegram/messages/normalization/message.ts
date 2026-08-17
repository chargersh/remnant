import { Effect } from "effect";
import { Api } from "telegram";
import type {
  TelegramForward,
  TelegramMessage,
  TelegramMessageEnvelope,
  TelegramMessageFileDiscovery,
  TelegramReply,
} from "@/providers/telegram/messages/contracts";
import {
  hashTelegramSemanticContent,
  TELEGRAM_SEMANTIC_HASH_VERSION,
} from "@/providers/telegram/serialization/semantic-hash";
import { normalizeTelegramEntities } from "./entity";
import { normalizeTelegramMedia } from "./media";
import { normalizeTelegramPeer } from "./peer";
import { normalizeTelegramServiceAction } from "./service-action";

export interface NormalizeTelegramMessageOptions {
  readonly accountPeerId: string;
  readonly observedAt: number;
  readonly rawSourceBatchId?: string;
}

const isPresent = <Value>(value: Value | null | undefined): value is Value =>
  value !== null && value !== undefined;

const optionalPeer = (peer: Api.TypePeer | null | undefined) =>
  isPresent(peer) ? normalizeTelegramPeer(peer) : Effect.undefined;

const inferSender = (
  source: Api.Message | Api.MessageService,
  peer: TelegramMessage["peer"],
  explicitSender: TelegramMessage["peer"],
  accountPeerId: string
) => {
  if (explicitSender !== undefined) {
    return explicitSender;
  }

  if (source.out === true) {
    return { peerId: accountPeerId, peerKind: "user" } as const;
  }

  if (peer?.peerKind === "user" || source.post === true) {
    return peer;
  }
};

const normalizeReply = Effect.fn("TelegramReply.normalize")(function* (
  reply: Api.MessageReplyHeader | null | undefined
) {
  if (!isPresent(reply)) {
    return { warnings: [] } as const;
  }

  const replyToPeer = yield* optionalPeer(reply.replyToPeerId);
  const quote = normalizeTelegramEntities(reply.quoteEntities);

  return {
    reply: {
      forumTopic: reply.forumTopic === true,
      ...(quote.entities.length === 0 ? {} : { quoteEntities: quote.entities }),
      ...(isPresent(reply.quoteOffset)
        ? { quoteOffset: reply.quoteOffset }
        : {}),
      ...(isPresent(reply.quoteText) ? { quoteText: reply.quoteText } : {}),
      ...(isPresent(reply.replyToMsgId)
        ? { replyToMessageId: reply.replyToMsgId }
        : {}),
      ...(replyToPeer === undefined ? {} : { replyToPeer }),
      ...(isPresent(reply.replyToTopId)
        ? { replyToTopId: reply.replyToTopId }
        : {}),
    } satisfies TelegramReply,
    warnings: quote.warnings,
  } as const;
});

const normalizeForward = Effect.fn("TelegramForward.normalize")(function* (
  forward: Api.TypeMessageFwdHeader | null | undefined
) {
  if (!(forward instanceof Api.MessageFwdHeader)) {
    return;
  }

  const fromPeer = yield* optionalPeer(forward.fromId);
  const savedFromPeer = yield* optionalPeer(forward.savedFromPeer);

  return {
    ...(isPresent(forward.channelPost)
      ? { channelPost: forward.channelPost }
      : {}),
    date: forward.date * 1000,
    ...(isPresent(forward.fromName) ? { fromName: forward.fromName } : {}),
    ...(fromPeer === undefined ? {} : { fromPeer }),
    imported: forward.imported === true,
    ...(isPresent(forward.postAuthor)
      ? { postAuthor: forward.postAuthor }
      : {}),
    ...(isPresent(forward.savedFromMsgId)
      ? { savedFromMessageId: forward.savedFromMsgId }
      : {}),
    ...(savedFromPeer === undefined ? {} : { savedFromPeer }),
  } satisfies TelegramForward;
});

export const normalizeTelegramMessageContent = Effect.fn(
  "TelegramMessage.normalizeContent"
)(function* (
  source: Api.TypeMessage,
  options: NormalizeTelegramMessageOptions
) {
  const base = {
    firstObservedAt: options.observedAt,
    ...(options.rawSourceBatchId === undefined
      ? {}
      : { rawSourceBatchId: options.rawSourceBatchId }),
    telegramMessageId: source.id,
  };

  if (source instanceof Api.MessageEmpty) {
    const peer = yield* optionalPeer(source.peerId);

    return {
      discoveredFiles: [],
      message: {
        ...base,
        kind: "empty",
        ...(peer === undefined ? {} : { peer }),
      },
      warnings: [],
    } as const;
  }

  const peer = yield* normalizeTelegramPeer(source.peerId);
  const messageBase = { ...base, peer };
  const explicitSender = yield* optionalPeer(source.fromId);
  const sender = inferSender(
    source,
    peer,
    explicitSender,
    options.accountPeerId
  );
  const outgoing = source.out === true;

  if (source instanceof Api.MessageService) {
    const action = normalizeTelegramServiceAction(source.action);

    return {
      discoveredFiles: [],
      message: {
        ...messageBase,
        action: action.action,
        kind: "service",
        outgoing,
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
  const discoveredFiles = media.files.map(
    ({ file, mediaRole }) =>
      ({
        file,
        source: {
          mediaRole,
          peer,
          telegramMessageId: source.id,
          type: "messageMedia",
        },
      }) satisfies TelegramMessageFileDiscovery
  );

  return {
    discoveredFiles,
    message: {
      ...messageBase,
      kind: "message",
      currentState: {
        ...(isPresent(source.forwards) ? { forwards: source.forwards } : {}),
        pinned: source.pinned === true,
        ...(isPresent(source.replies)
          ? { replyCount: source.replies.replies }
          : {}),
        ...(isPresent(source.views) ? { views: source.views } : {}),
      },
      ...(isPresent(source.editDate)
        ? { editDate: source.editDate * 1000 }
        : {}),
      entities: entities.entities,
      ...(forward === undefined ? {} : { forward }),
      ...(isPresent(source.groupedId)
        ? { groupedId: source.groupedId.toString() }
        : {}),
      ...(media.media === undefined ? {} : { media: media.media }),
      outgoing,
      ...(reply.reply === undefined ? {} : { reply: reply.reply }),
      ...(sender === undefined ? {} : { sender }),
      sentAt: source.date * 1000,
      text: source.message,
    },
    warnings: [...entities.warnings, ...media.warnings, ...reply.warnings],
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
