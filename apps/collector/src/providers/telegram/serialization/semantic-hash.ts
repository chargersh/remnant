import { Crypto, Effect } from "effect";
import type { TelegramMessage } from "@/providers/telegram/messages/contracts";
import { encodeCanonicalJson } from "./canonical-json";
import { encodeTelegramRawValue } from "./raw-value";

export const TELEGRAM_SEMANTIC_HASH_VERSION = 1 as const;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const selectSemanticMedia = (
  media: Extract<TelegramMessage, { kind: "message" }>["media"]
) => {
  if (media?.telegramType === "photo") {
    const { primaryFile: _primaryFile, ...semanticMedia } = media;
    return semanticMedia;
  }

  if (media?.telegramType === "document") {
    const {
      primaryFile: _primaryFile,
      videoCoverFile: _videoCoverFile,
      ...semanticMedia
    } = media;
    return semanticMedia;
  }

  return media;
};

export const selectTelegramSemanticContent = (message: TelegramMessage) => {
  if (message.kind === "empty") {
    return {
      kind: message.kind,
      peer: message.peer,
      telegramMessageId: message.telegramMessageId,
    };
  }

  if (message.kind === "service") {
    return {
      action: message.action,
      kind: message.kind,
      outgoing: message.outgoing,
      peer: message.peer,
      sender: message.sender,
      sentAt: message.sentAt,
    };
  }

  return {
    kind: message.kind,
    entities: message.entities,
    forward: message.forward,
    groupedId: message.groupedId,
    media: selectSemanticMedia(message.media),
    outgoing: message.outgoing,
    peer: message.peer,
    reply: message.reply,
    sender: message.sender,
    sentAt: message.sentAt,
    text: message.text,
  };
};

export const hashTelegramSemanticContent = Effect.fn(
  "TelegramSemanticContent.hash"
)(function* (message: TelegramMessage) {
  const crypto = yield* Crypto.Crypto;
  const canonicalValue = yield* encodeTelegramRawValue({
    semanticHashVersion: TELEGRAM_SEMANTIC_HASH_VERSION,
    content: selectTelegramSemanticContent(message),
  });
  const canonicalJson = yield* encodeCanonicalJson(canonicalValue);
  const digest = yield* crypto.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson)
  );

  return toHex(digest);
});
