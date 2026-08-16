export type TelegramPeerKind = "channel" | "chat" | "user";

export interface TelegramPeer {
  readonly peerId: string;
  readonly peerKind: TelegramPeerKind;
}

export type TelegramEntityType =
  | "bankCard"
  | "blockquote"
  | "bold"
  | "botCommand"
  | "cashtag"
  | "code"
  | "customEmoji"
  | "email"
  | "hashtag"
  | "italic"
  | "mention"
  | "mentionName"
  | "phone"
  | "pre"
  | "spoiler"
  | "strike"
  | "textUrl"
  | "underline"
  | "unknown"
  | "url";

export interface TelegramMessageEntity {
  readonly collapsed?: boolean;
  readonly documentId?: string;
  readonly language?: string;
  readonly length: number;
  readonly offset: number;
  readonly telegramConstructor: string;
  readonly type: TelegramEntityType;
  readonly url?: string;
  readonly userId?: string;
}

export interface TelegramPhotoSize {
  readonly bytesBase64?: string;
  readonly height?: number;
  readonly size?: number;
  readonly sizes?: readonly number[];
  readonly telegramConstructor: string;
  readonly type: string;
  readonly width?: number;
}

export type TelegramDocumentPresentation =
  | "animation"
  | "audio"
  | "customEmoji"
  | "file"
  | "imageFile"
  | "roundVideo"
  | "sticker"
  | "video"
  | "voice";

export interface TelegramDocumentAttributes {
  readonly animated: boolean;
  readonly audio?: {
    readonly durationSeconds: number;
    readonly performer?: string;
    readonly title?: string;
    readonly voice: boolean;
    readonly waveformBase64?: string;
  };
  readonly customEmoji?: {
    readonly alt: string;
    readonly free: boolean;
    readonly textColor: boolean;
  };
  readonly fileName?: string;
  readonly imageSize?: {
    readonly height: number;
    readonly width: number;
  };
  readonly sticker?: {
    readonly alt: string;
    readonly mask: boolean;
  };
  readonly telegramConstructors: readonly string[];
  readonly video?: {
    readonly durationSeconds: number;
    readonly height: number;
    readonly noSound: boolean;
    readonly roundMessage: boolean;
    readonly supportsStreaming: boolean;
    readonly width: number;
  };
}

export interface TelegramFileCandidate {
  readonly accessHash: string;
  readonly dcId: number;
  readonly expectedSize?: string;
  readonly fileReferenceBase64: string;
  readonly mediaRole: "primary" | "videoCover";
  readonly mimeType?: string;
  readonly originalFileName?: string;
  readonly presentation?: TelegramDocumentPresentation;
  readonly telegramFileId: string;
  readonly telegramObjectKind: "document" | "photo";
}

export interface TelegramPhotoMedia {
  readonly ephemeral?: TelegramEphemeralMedia;
  readonly photoId?: string;
  readonly primaryFile?: TelegramFileCandidate;
  readonly sizes: readonly TelegramPhotoSize[];
  readonly spoiler: boolean;
  readonly telegramConstructor: string;
  readonly telegramType: "photo";
}

export interface TelegramDocumentMedia {
  readonly alternativeDocumentIds: readonly string[];
  readonly attributes?: TelegramDocumentAttributes;
  readonly documentId?: string;
  readonly ephemeral?: TelegramEphemeralMedia;
  readonly mimeType?: string;
  readonly presentation: TelegramDocumentPresentation;
  readonly primaryFile?: TelegramFileCandidate;
  readonly spoiler: boolean;
  readonly telegramConstructor: string;
  readonly telegramType: "document";
  readonly thumbs: readonly TelegramPhotoSize[];
  readonly videoCoverFile?: TelegramFileCandidate;
  readonly videoCoverPhotoId?: string;
}

export interface TelegramEphemeralMedia {
  readonly mode: "timed" | "viewOnce";
  readonly preservationResult: "pending";
  readonly ttlSeconds?: number;
}

export type TelegramMedia =
  | TelegramDocumentMedia
  | TelegramPhotoMedia
  | {
      readonly description?: string;
      readonly telegramConstructor: string;
      readonly telegramType: "webPage";
      readonly title?: string;
      readonly url?: string;
    }
  | {
      readonly emoticon: string;
      readonly telegramConstructor: string;
      readonly telegramType: "dice";
      readonly value: number;
    }
  | {
      readonly firstName: string;
      readonly lastName: string;
      readonly phoneNumber: string;
      readonly telegramConstructor: string;
      readonly telegramType: "contact";
      readonly telegramUserId?: string;
      readonly vcard: string;
    }
  | {
      readonly latitude?: number;
      readonly longitude?: number;
      readonly telegramConstructor: string;
      readonly telegramType: "geo" | "geoLive" | "venue";
      readonly title?: string;
    }
  | {
      readonly telegramConstructor: string;
      readonly telegramType: "unsupported";
    };

export interface TelegramReply {
  readonly forumTopic: boolean;
  readonly quoteEntities?: readonly TelegramMessageEntity[];
  readonly quoteOffset?: number;
  readonly quoteText?: string;
  readonly replyToMessageId?: number;
  readonly replyToPeer?: TelegramPeer;
  readonly replyToTopId?: number;
}

export interface TelegramForward {
  readonly channelPost?: number;
  readonly date: number;
  readonly fromName?: string;
  readonly fromPeer?: TelegramPeer;
  readonly imported: boolean;
  readonly postAuthor?: string;
  readonly savedFromMessageId?: number;
  readonly savedFromPeer?: TelegramPeer;
}

export type TelegramServiceAction =
  | {
      readonly telegramConstructor: string;
      readonly type: "chatPhotoDeleted" | "historyCleared" | "messagePinned";
    }
  | {
      readonly telegramConstructor: string;
      readonly title: string;
      readonly type: "channelCreated" | "chatCreated" | "chatTitleChanged";
      readonly userIds?: readonly string[];
    }
  | {
      readonly telegramConstructor: string;
      readonly type: "chatPhotoChanged";
      readonly photoId?: string;
    }
  | {
      readonly telegramConstructor: string;
      readonly type: "usersAdded";
      readonly userIds: readonly string[];
    }
  | {
      readonly telegramConstructor: string;
      readonly type: "userRemoved";
      readonly userId: string;
    }
  | {
      readonly inviterId: string;
      readonly telegramConstructor: string;
      readonly type: "joinedByLink";
    }
  | {
      readonly channelId: string;
      readonly telegramConstructor: string;
      readonly type: "chatMigratedToChannel";
    }
  | {
      readonly chatId: string;
      readonly telegramConstructor: string;
      readonly title: string;
      readonly type: "channelMigratedFromChat";
    }
  | {
      readonly periodSeconds: number;
      readonly telegramConstructor: string;
      readonly type: "historyTtlChanged";
    }
  | {
      readonly message: string;
      readonly telegramConstructor: string;
      readonly type: "custom";
    }
  | {
      readonly telegramConstructor: string;
      readonly type: "unsupported";
    };

interface TelegramMessageBase {
  readonly firstObservedAt: number;
  readonly peer?: TelegramPeer;
  readonly rawSourceBatchId?: string;
  readonly telegramMessageId: number;
}

export interface TelegramOrdinaryMessage extends TelegramMessageBase {
  readonly currentState: {
    readonly forwards?: number;
    readonly pinned: boolean;
    readonly replyCount?: number;
    readonly views?: number;
  };
  readonly editDate?: number;
  readonly entities: readonly TelegramMessageEntity[];
  readonly forward?: TelegramForward;
  readonly groupedId?: string;
  readonly kind: "message";
  readonly media?: TelegramMedia;
  readonly reply?: TelegramReply;
  readonly sender?: TelegramPeer;
  readonly sentAt: number;
  readonly text: string;
}

export interface TelegramServiceMessage extends TelegramMessageBase {
  readonly action: TelegramServiceAction;
  readonly kind: "service";
  readonly sender?: TelegramPeer;
  readonly sentAt: number;
}

export interface TelegramEmptyMessage extends TelegramMessageBase {
  readonly kind: "empty";
}

export type TelegramMessage =
  | TelegramEmptyMessage
  | TelegramOrdinaryMessage
  | TelegramServiceMessage;

export interface TelegramNormalizationWarning {
  readonly code:
    | "emptyDocument"
    | "emptyPhoto"
    | "unsupportedEntity"
    | "unsupportedMedia"
    | "unsupportedServiceAction";
  readonly telegramConstructor: string;
}

export interface TelegramMessageEnvelope {
  readonly discoveredFiles: readonly TelegramFileCandidate[];
  readonly message: TelegramMessage;
  readonly semanticHash: string;
  readonly semanticHashVersion: 1;
  readonly warnings: readonly TelegramNormalizationWarning[];
}
