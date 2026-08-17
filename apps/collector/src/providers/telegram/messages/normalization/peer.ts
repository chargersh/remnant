import { Data, Effect } from "effect";
import { Api } from "telegram";
import type { TelegramPeer } from "@/providers/telegram/messages/contracts";

export class TelegramPeerNormalizationError extends Data.TaggedError(
  "TelegramPeerNormalizationError"
)<{
  readonly telegramConstructor: string;
}> {}

const telegramConstructorOf = (value: unknown) => {
  if (
    typeof value === "object" &&
    value !== null &&
    "className" in value &&
    typeof value.className === "string"
  ) {
    return value.className;
  }

  return "unknown";
};

export const normalizeTelegramPeer = Effect.fn("TelegramPeer.normalize")(
  function* (peer: Api.TypePeer) {
    if (peer instanceof Api.PeerUser) {
      return {
        peerId: peer.userId.toString(),
        peerKind: "user",
      } satisfies TelegramPeer;
    }

    if (peer instanceof Api.PeerChat) {
      return {
        peerId: peer.chatId.toString(),
        peerKind: "chat",
      } satisfies TelegramPeer;
    }

    if (peer instanceof Api.PeerChannel) {
      return {
        peerId: peer.channelId.toString(),
        peerKind: "channel",
      } satisfies TelegramPeer;
    }

    return yield* new TelegramPeerNormalizationError({
      telegramConstructor: telegramConstructorOf(peer),
    });
  }
);
