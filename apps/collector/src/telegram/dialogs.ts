import { Data, Effect, Option } from "effect";
import { Api } from "telegram";
import type { Dialog } from "telegram/tl/custom/dialog";
import { TelegramClient } from "./client";

interface TelegramDialogBase {
  readonly archived: boolean;
  readonly id: string;
  readonly name: string;
  readonly pinned: boolean;
  readonly unreadCount: number;
  readonly unreadMentionsCount: number;
}

export interface TelegramUserDialog extends TelegramDialogBase {
  readonly isBot: boolean;
  readonly type: "user";
  readonly username?: string;
}

export interface TelegramGroupDialog extends TelegramDialogBase {
  readonly type: "group";
  readonly username?: string;
}

export interface TelegramChannelDialog extends TelegramDialogBase {
  readonly isBroadcast: boolean;
  readonly type: "channel";
  readonly username?: string;
}

export type TelegramDialog =
  | TelegramChannelDialog
  | TelegramGroupDialog
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

const commonDialogFields = (dialog: Dialog, name: string) => ({
  archived: dialog.archived,
  id: dialog.id?.toString() ?? "",
  name,
  pinned: dialog.pinned,
  unreadCount: dialog.unreadCount,
  unreadMentionsCount: dialog.unreadMentionsCount,
});

const normalizeChatDialog = (
  dialog: Dialog,
  entity: Api.Chat | Api.ChatForbidden,
  id: string
): TelegramGroupDialog => ({
  ...commonDialogFields(dialog, normalizeName(entity.title, id)),
  type: "group",
});

const normalizeDialog = (dialog: Dialog): Option.Option<TelegramDialog> => {
  const entity = dialog.entity;
  const id = dialog.id?.toString();

  if (!(entity && id)) {
    return Option.none();
  }

  if (entity instanceof Api.User) {
    const username = normalizeUsername(entity.username);
    const name = normalizeName(
      [entity.firstName, entity.lastName]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(" "),
      username ?? id
    );

    return Option.some({
      ...commonDialogFields(dialog, name),
      isBot: entity.bot === true,
      type: "user",
      ...(username === undefined ? {} : { username }),
    });
  }

  if (entity instanceof Api.Chat || entity instanceof Api.ChatForbidden) {
    return Option.some(normalizeChatDialog(dialog, entity, id));
  }

  if (entity instanceof Api.Channel || entity instanceof Api.ChannelForbidden) {
    const username =
      entity instanceof Api.Channel
        ? normalizeUsername(entity.username)
        : undefined;
    const common = commonDialogFields(dialog, normalizeName(entity.title, id));

    if (entity.megagroup === true) {
      return Option.some({
        ...common,
        type: "group",
        ...(username === undefined ? {} : { username }),
      });
    }

    return Option.some({
      ...common,
      isBroadcast: entity.broadcast === true,
      type: "channel",
      ...(username === undefined ? {} : { username }),
    });
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
