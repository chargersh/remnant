import { Data, Effect } from "effect";
import { Api } from "telegram";
import type { TelegramPeer } from "./message-contracts";

export class TelegramPeerNormalizationError extends Data.TaggedError(
  "TelegramPeerNormalizationError"
)<{
  readonly telegramConstructor: string;
}> {}

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
      telegramConstructor:
        (peer as { className?: string }).className ?? "unknown",
    });
  }
);
