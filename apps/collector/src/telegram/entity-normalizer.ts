import { Api } from "telegram";
import type {
  TelegramEntityType,
  TelegramMessageEntity,
  TelegramNormalizationWarning,
} from "./message-contracts";

const simpleEntityTypes = new Map<string, TelegramEntityType>([
  ["MessageEntityBankCard", "bankCard"],
  ["MessageEntityBold", "bold"],
  ["MessageEntityBotCommand", "botCommand"],
  ["MessageEntityCashtag", "cashtag"],
  ["MessageEntityCode", "code"],
  ["MessageEntityEmail", "email"],
  ["MessageEntityHashtag", "hashtag"],
  ["MessageEntityItalic", "italic"],
  ["MessageEntityMention", "mention"],
  ["MessageEntityPhone", "phone"],
  ["MessageEntitySpoiler", "spoiler"],
  ["MessageEntityStrike", "strike"],
  ["MessageEntityUnderline", "underline"],
  ["MessageEntityUrl", "url"],
]);

const baseEntity = (entity: Api.TypeMessageEntity) => ({
  length: entity.length,
  offset: entity.offset,
  telegramConstructor: entity.className,
});

export const normalizeTelegramEntity = (
  entity: Api.TypeMessageEntity
): {
  readonly entity: TelegramMessageEntity;
  readonly warning?: TelegramNormalizationWarning;
} => {
  const simpleType = simpleEntityTypes.get(entity.className);

  if (simpleType) {
    return {
      entity: {
        ...baseEntity(entity),
        type: simpleType,
      },
    };
  }

  if (entity instanceof Api.MessageEntityPre) {
    return {
      entity: {
        ...baseEntity(entity),
        language: entity.language,
        type: "pre",
      },
    };
  }

  if (entity instanceof Api.MessageEntityTextUrl) {
    return {
      entity: {
        ...baseEntity(entity),
        type: "textUrl",
        url: entity.url,
      },
    };
  }

  if (entity instanceof Api.MessageEntityMentionName) {
    return {
      entity: {
        ...baseEntity(entity),
        type: "mentionName",
        userId: entity.userId.toString(),
      },
    };
  }

  if (
    entity instanceof Api.InputMessageEntityMentionName &&
    entity.userId instanceof Api.InputUser
  ) {
    return {
      entity: {
        ...baseEntity(entity),
        type: "mentionName",
        userId: entity.userId.userId.toString(),
      },
    };
  }

  if (entity instanceof Api.MessageEntityCustomEmoji) {
    return {
      entity: {
        ...baseEntity(entity),
        documentId: entity.documentId.toString(),
        type: "customEmoji",
      },
    };
  }

  if (entity instanceof Api.MessageEntityBlockquote) {
    return {
      entity: {
        ...baseEntity(entity),
        collapsed: entity.collapsed === true,
        type: "blockquote",
      },
    };
  }

  return {
    entity: {
      ...baseEntity(entity),
      type: "unknown",
    },
    warning: {
      code: "unsupportedEntity",
      telegramConstructor: entity.className,
    },
  };
};

export const normalizeTelegramEntities = (
  entities: readonly Api.TypeMessageEntity[] | null | undefined
) => {
  const normalized: TelegramMessageEntity[] = [];
  const warnings: TelegramNormalizationWarning[] = [];

  for (const entity of entities ?? []) {
    const result = normalizeTelegramEntity(entity);
    normalized.push(result.entity);

    if (result.warning) {
      warnings.push(result.warning);
    }
  }

  return { entities: normalized, warnings } as const;
};
