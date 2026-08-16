import { Api } from "telegram";
import type {
  TelegramNormalizationWarning,
  TelegramServiceAction,
} from "./message-contracts";

export const normalizeTelegramServiceAction = (
  action: Api.TypeMessageAction
): {
  readonly action: TelegramServiceAction;
  readonly warning?: TelegramNormalizationWarning;
} => {
  const telegramConstructor = action.className;

  if (action instanceof Api.MessageActionChatCreate) {
    return {
      action: {
        telegramConstructor,
        title: action.title,
        type: "chatCreated",
        userIds: action.users.map(String),
      },
    };
  }

  if (action instanceof Api.MessageActionChatEditTitle) {
    return {
      action: {
        telegramConstructor,
        title: action.title,
        type: "chatTitleChanged",
      },
    };
  }

  if (action instanceof Api.MessageActionChatEditPhoto) {
    return {
      action: {
        telegramConstructor,
        type: "chatPhotoChanged",
        ...(action.photo instanceof Api.Photo
          ? { photoId: action.photo.id.toString() }
          : {}),
      },
    };
  }

  if (action instanceof Api.MessageActionChatDeletePhoto) {
    return {
      action: { telegramConstructor, type: "chatPhotoDeleted" },
    };
  }

  if (action instanceof Api.MessageActionChatAddUser) {
    return {
      action: {
        telegramConstructor,
        type: "usersAdded",
        userIds: action.users.map(String),
      },
    };
  }

  if (action instanceof Api.MessageActionChatDeleteUser) {
    return {
      action: {
        telegramConstructor,
        type: "userRemoved",
        userId: action.userId.toString(),
      },
    };
  }

  if (action instanceof Api.MessageActionChatJoinedByLink) {
    return {
      action: {
        inviterId: action.inviterId.toString(),
        telegramConstructor,
        type: "joinedByLink",
      },
    };
  }

  if (action instanceof Api.MessageActionChannelCreate) {
    return {
      action: {
        telegramConstructor,
        title: action.title,
        type: "channelCreated",
      },
    };
  }

  if (action instanceof Api.MessageActionChatMigrateTo) {
    return {
      action: {
        channelId: action.channelId.toString(),
        telegramConstructor,
        type: "chatMigratedToChannel",
      },
    };
  }

  if (action instanceof Api.MessageActionChannelMigrateFrom) {
    return {
      action: {
        chatId: action.chatId.toString(),
        telegramConstructor,
        title: action.title,
        type: "channelMigratedFromChat",
      },
    };
  }

  if (action instanceof Api.MessageActionPinMessage) {
    return {
      action: { telegramConstructor, type: "messagePinned" },
    };
  }

  if (action instanceof Api.MessageActionHistoryClear) {
    return {
      action: { telegramConstructor, type: "historyCleared" },
    };
  }

  if (action instanceof Api.MessageActionSetMessagesTTL) {
    return {
      action: {
        periodSeconds: action.period,
        telegramConstructor,
        type: "historyTtlChanged",
      },
    };
  }

  if (action instanceof Api.MessageActionCustomAction) {
    return {
      action: {
        message: action.message,
        telegramConstructor,
        type: "custom",
      },
    };
  }

  return {
    action: {
      telegramConstructor,
      type: "unsupported",
    },
    warning: {
      code: "unsupportedServiceAction",
      telegramConstructor,
    },
  };
};
