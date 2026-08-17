import { Api } from "telegram";
import type {
  TelegramNormalizationWarning,
  TelegramPhoneCallDiscardReason,
  TelegramServiceAction,
} from "@/providers/telegram/messages/contracts";

interface NormalizedServiceAction {
  readonly action: TelegramServiceAction;
  readonly warning?: TelegramNormalizationWarning;
}

const normalizePhoneCallDiscardReason = (
  reason: Api.TypePhoneCallDiscardReason
): {
  readonly reason: TelegramPhoneCallDiscardReason;
  readonly warning?: TelegramNormalizationWarning;
} => {
  const telegramConstructor = reason.className;

  if (reason instanceof Api.PhoneCallDiscardReasonMissed) {
    return { reason: { telegramConstructor, type: "missed" } };
  }

  if (reason instanceof Api.PhoneCallDiscardReasonDisconnect) {
    return { reason: { telegramConstructor, type: "disconnected" } };
  }

  if (reason instanceof Api.PhoneCallDiscardReasonHangup) {
    return { reason: { telegramConstructor, type: "hangup" } };
  }

  if (reason instanceof Api.PhoneCallDiscardReasonBusy) {
    return { reason: { telegramConstructor, type: "busy" } };
  }

  if (reason instanceof Api.PhoneCallDiscardReasonAllowGroupCall) {
    return { reason: { telegramConstructor, type: "allowGroupCall" } };
  }

  return {
    reason: { telegramConstructor, type: "unsupported" },
    warning: {
      code: "unsupportedPhoneCallDiscardReason",
      telegramConstructor,
    },
  };
};

const normalizeChatServiceAction = (
  action: Api.TypeMessageAction
): NormalizedServiceAction | undefined => {
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
};

const normalizeGroupCallServiceAction = (
  action: Api.TypeMessageAction
): NormalizedServiceAction | undefined => {
  const telegramConstructor = action.className;

  if (action instanceof Api.MessageActionGroupCall) {
    const durationIsPresent =
      action.duration !== undefined && action.duration !== null;

    return {
      action: {
        callId: action.call.id.toString(),
        ...(durationIsPresent ? { durationSeconds: action.duration } : {}),
        state: durationIsPresent ? "ended" : "started",
        telegramConstructor,
        type: "groupCall",
      },
    };
  }

  if (action instanceof Api.MessageActionGroupCallScheduled) {
    return {
      action: {
        callId: action.call.id.toString(),
        scheduledAt: action.scheduleDate * 1000,
        telegramConstructor,
        type: "groupCallScheduled",
      },
    };
  }

  if (action instanceof Api.MessageActionInviteToGroupCall) {
    return {
      action: {
        callId: action.call.id.toString(),
        telegramConstructor,
        type: "groupCallInvitation",
        userIds: action.users.map(String),
      },
    };
  }
};

export const normalizeTelegramServiceAction = (
  action: Api.TypeMessageAction
): NormalizedServiceAction => {
  const telegramConstructor = action.className;
  const chatAction = normalizeChatServiceAction(action);
  const groupCallAction = normalizeGroupCallServiceAction(action);

  if (chatAction !== undefined) {
    return chatAction;
  }

  if (groupCallAction !== undefined) {
    return groupCallAction;
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

  if (action instanceof Api.MessageActionPhoneCall) {
    const normalizedReason = action.reason
      ? normalizePhoneCallDiscardReason(action.reason)
      : undefined;

    return {
      action: {
        callId: action.callId.toString(),
        ...(action.duration === undefined || action.duration === null
          ? {}
          : { durationSeconds: action.duration }),
        mode: action.video === true ? "video" : "audio",
        ...(normalizedReason === undefined
          ? {}
          : { reason: normalizedReason.reason }),
        telegramConstructor,
        type: "phoneCall",
      },
      ...(normalizedReason?.warning === undefined
        ? {}
        : { warning: normalizedReason.warning }),
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
