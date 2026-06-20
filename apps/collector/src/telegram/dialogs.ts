import { Data, Effect, Option } from "effect";
import { Api } from "telegram";
import type { Dialog } from "telegram/tl/custom/dialog";
import { TelegramClient } from "./client";

interface TelegramDialogBase {
  readonly archived: boolean;
  /**
   * GramJS's marked dialog ID. Users are positive, legacy chats are negative,
   * and channels/supergroups use the `-100...` form.
   */
  readonly dialogId: string;
  readonly folderId?: number;
  readonly name: string;
  /**
   * The unmarked Telegram entity ID. Persist it together with `peerKind`;
   * raw IDs are not globally unique across Telegram peer kinds.
   */
  readonly peerId: string;
  readonly pinned: boolean;
  readonly unreadCount: number;
  readonly unreadMentionsCount: number;
}

export interface TelegramUserDialog extends TelegramDialogBase {
  readonly accessHash?: string;
  readonly isBot: boolean;
  readonly isDeleted: boolean;
  readonly isSelf: boolean;
  readonly peerKind: "user";
  readonly type: "user";
  readonly username?: string;
}

export interface TelegramLegacyGroupDialog extends TelegramDialogBase {
  readonly availability: "available" | "forbidden";
  readonly peerKind: "chat";
  readonly type: "group";
}

export interface TelegramSupergroupDialog extends TelegramDialogBase {
  readonly accessHash: string;
  readonly availability: "available" | "forbidden";
  readonly peerKind: "channel";
  readonly type: "group";
  readonly username?: string;
}

export interface TelegramBroadcastChannelDialog extends TelegramDialogBase {
  readonly accessHash: string;
  readonly availability: "available" | "forbidden";
  readonly isBroadcast: boolean;
  readonly peerKind: "channel";
  readonly type: "channel";
  readonly username?: string;
}

export type TelegramDialog =
  | TelegramBroadcastChannelDialog
  | TelegramLegacyGroupDialog
  | TelegramSupergroupDialog
  | TelegramUserDialog;

export interface GetTelegramDialogsOptions {
  readonly limit?: number;
}

export class TelegramDialogsFetchError extends Data.TaggedError(
  "TelegramDialogsFetchError"
)<{
  readonly cause: unknown;
}> {}

const normalizeName = (value: string | undefined, fallback: string) => {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
};

const normalizeUsername = (value: string | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const isMigratedLegacyChat = (dialog: Dialog) => {
  const entity = dialog.entity;

  return (
    entity instanceof Api.Chat &&
    typeof entity.migratedTo === "object" &&
    entity.migratedTo !== null &&
    "channelId" in entity.migratedTo
  );
};

const commonDialogFields = (
  dialog: Dialog,
  entity: Api.User | Api.TypeChat,
  name: string
) => {
  const folderId = dialog.folderId;

  return {
    archived: dialog.archived,
    dialogId: dialog.id?.toString() ?? "",
    ...(typeof folderId === "number" ? { folderId } : {}),
    name,
    peerId: entity.id.toString(),
    pinned: dialog.pinned,
    unreadCount: dialog.unreadCount,
    unreadMentionsCount: dialog.unreadMentionsCount,
  };
};

const normalizeChatDialog = (
  dialog: Dialog,
  entity: Api.Chat | Api.ChatForbidden,
  peerId: string
): TelegramLegacyGroupDialog => ({
  ...commonDialogFields(dialog, entity, normalizeName(entity.title, peerId)),
  availability: entity instanceof Api.ChatForbidden ? "forbidden" : "available",
  peerKind: "chat",
  type: "group",
});

const normalizeUserDialog = (
  dialog: Dialog,
  entity: Api.User
): TelegramUserDialog => {
  const username = normalizeUsername(entity.username);
  const peerId = entity.id.toString();
  const name = normalizeName(
    [entity.firstName, entity.lastName]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(" "),
    username ?? peerId
  );
  const accessHash = entity.accessHash?.toString();

  return {
    ...commonDialogFields(dialog, entity, name),
    ...(accessHash === undefined ? {} : { accessHash }),
    isBot: entity.bot === true,
    isDeleted: entity.deleted === true,
    isSelf: entity.self === true,
    peerKind: "user",
    type: "user",
    ...(username === undefined ? {} : { username }),
  };
};

const normalizeChannelDialog = (
  dialog: Dialog,
  entity: Api.Channel | Api.ChannelForbidden
): Option.Option<TelegramBroadcastChannelDialog | TelegramSupergroupDialog> => {
  const username =
    entity instanceof Api.Channel
      ? normalizeUsername(entity.username)
      : undefined;
  const accessHash = entity.accessHash?.toString();

  // GramJS constructs Dialog.inputEntity with getInputPeer(entity), which
  // requires a usable access hash for channels. Keep this defensive check so
  // the persisted contract never claims a channel can be resolved when it
  // cannot.
  if (accessHash === undefined) {
    return Option.none();
  }

  const common = commonDialogFields(
    dialog,
    entity,
    normalizeName(entity.title, entity.id.toString())
  );
  const availability =
    entity instanceof Api.ChannelForbidden
      ? ("forbidden" as const)
      : ("available" as const);
  const channelFields = {
    ...common,
    accessHash,
    availability,
    peerKind: "channel" as const,
    ...(username === undefined ? {} : { username }),
  };

  if (entity.megagroup === true) {
    return Option.some({
      ...channelFields,
      type: "group",
    });
  }

  return Option.some({
    ...channelFields,
    isBroadcast: entity.broadcast === true,
    type: "channel",
  });
};

const normalizeDialog = (dialog: Dialog): Option.Option<TelegramDialog> => {
  const entity = dialog.entity;

  if (!(entity && dialog.id)) {
    return Option.none();
  }

  if (entity instanceof Api.User) {
    return Option.some(normalizeUserDialog(dialog, entity));
  }

  if (entity instanceof Api.Chat || entity instanceof Api.ChatForbidden) {
    return Option.some(
      normalizeChatDialog(dialog, entity, entity.id.toString())
    );
  }

  if (entity instanceof Api.Channel || entity instanceof Api.ChannelForbidden) {
    return normalizeChannelDialog(dialog, entity);
  }

  return Option.none();
};

export const getTelegramDialogs = Effect.fn("TelegramDialogs.get")(function* (
  options: GetTelegramDialogsOptions = {}
) {
  const client = yield* TelegramClient;
  const dialogs = yield* Effect.tryPromise({
    try: () =>
      client.getDialogs({
        limit: options.limit,
      }),
    catch: (cause) => new TelegramDialogsFetchError({ cause }),
  });
  const currentDialogs = dialogs.filter(
    (dialog) => !isMigratedLegacyChat(dialog)
  );
  const normalizedDialogs = currentDialogs.flatMap((dialog) =>
    Option.toArray(normalizeDialog(dialog))
  );
  const migratedCount = dialogs.length - currentDialogs.length;
  const skippedCount = currentDialogs.length - normalizedDialogs.length;

  if (migratedCount > 0) {
    yield* Effect.logInfo("Skipped migrated legacy Telegram dialogs", {
      migratedCount,
    });
  }

  if (skippedCount > 0) {
    yield* Effect.logWarning("Skipped unsupported Telegram dialogs", {
      skippedCount,
    });
  }

  return normalizedDialogs;
});
