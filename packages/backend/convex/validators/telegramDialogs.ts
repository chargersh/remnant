import type { Infer } from "convex/values";
import { v } from "convex/values";
import { dialogSyncIdValidator } from "./dialogSync";
import {
  telegramAccessHashValidator,
  telegramAvailabilityValidator,
  telegramDialogIdValidator,
  telegramIdValidator,
} from "./telegram";

export const telegramDialogSourceStatusValidator = v.union(
  v.literal("active"),
  v.literal("missing")
);

export const telegramDialogSnapshotBaseValidator = v.object({
  archived: v.boolean(),
  dialogId: telegramDialogIdValidator,
  folderId: v.optional(v.number()),
  name: v.string(),
  peerId: telegramIdValidator,
  pinned: v.boolean(),
  unreadCount: v.number(),
  unreadMentionsCount: v.number(),
});

export const telegramUserDialogSnapshotValidator = v.object({
  ...telegramDialogSnapshotBaseValidator.fields,
  accessHash: v.optional(telegramAccessHashValidator),
  isBot: v.boolean(),
  isDeleted: v.boolean(),
  isSelf: v.boolean(),
  peerKind: v.literal("user"),
  type: v.literal("user"),
  username: v.optional(v.string()),
});

export const telegramLegacyGroupDialogSnapshotValidator = v.object({
  ...telegramDialogSnapshotBaseValidator.fields,
  availability: telegramAvailabilityValidator,
  peerKind: v.literal("chat"),
  type: v.literal("group"),
});

export const telegramChannelDialogSnapshotBaseValidator = v.object({
  ...telegramDialogSnapshotBaseValidator.fields,
  accessHash: telegramAccessHashValidator,
  availability: telegramAvailabilityValidator,
  peerKind: v.literal("channel"),
  username: v.optional(v.string()),
});

export const telegramSupergroupDialogSnapshotValidator = v.object({
  ...telegramChannelDialogSnapshotBaseValidator.fields,
  type: v.literal("group"),
});

export const telegramBroadcastChannelDialogSnapshotValidator = v.object({
  ...telegramChannelDialogSnapshotBaseValidator.fields,
  isBroadcast: v.boolean(),
  type: v.literal("channel"),
});

export const telegramDialogSnapshotValidator = v.union(
  telegramUserDialogSnapshotValidator,
  telegramLegacyGroupDialogSnapshotValidator,
  telegramSupergroupDialogSnapshotValidator,
  telegramBroadcastChannelDialogSnapshotValidator
);

export const telegramDialogBaseValidator = v.object({
  accountId: v.id("telegramAccounts"),
  archived: v.boolean(),
  dialogId: telegramDialogIdValidator,
  firstSeenAt: v.number(),
  folderId: v.optional(v.number()),
  lastSeenAt: v.number(),
  lastSeenSyncId: dialogSyncIdValidator,
  metadataUpdatedAt: v.number(),
  missingSince: v.optional(v.number()),
  name: v.string(),
  peerId: telegramIdValidator,
  pinned: v.boolean(),
  sourceStatus: telegramDialogSourceStatusValidator,
  trackingEnabled: v.boolean(),
});

export const telegramChannelDialogBaseValidator = v.object({
  ...telegramDialogBaseValidator.fields,
  accessHash: telegramAccessHashValidator,
  availability: telegramAvailabilityValidator,
  peerKind: v.literal("channel"),
  username: v.optional(v.string()),
});

export const telegramUserDialogValidator = v.object({
  ...telegramDialogBaseValidator.fields,
  accessHash: v.optional(telegramAccessHashValidator),
  isBot: v.boolean(),
  isDeleted: v.boolean(),
  isSelf: v.boolean(),
  peerKind: v.literal("user"),
  type: v.literal("user"),
  username: v.optional(v.string()),
});

export const telegramLegacyGroupDialogValidator = v.object({
  ...telegramDialogBaseValidator.fields,
  availability: telegramAvailabilityValidator,
  peerKind: v.literal("chat"),
  type: v.literal("group"),
});

export const telegramSupergroupDialogValidator = v.object({
  ...telegramChannelDialogBaseValidator.fields,
  type: v.literal("group"),
});

export const telegramBroadcastChannelDialogValidator = v.object({
  ...telegramChannelDialogBaseValidator.fields,
  isBroadcast: v.boolean(),
  type: v.literal("channel"),
});

export const telegramDialogValidator = v.union(
  telegramUserDialogValidator,
  telegramLegacyGroupDialogValidator,
  telegramSupergroupDialogValidator,
  telegramBroadcastChannelDialogValidator
);

export type TelegramBroadcastChannelDialog = Infer<
  typeof telegramBroadcastChannelDialogValidator
>;
export type TelegramBroadcastChannelDialogSnapshot = Infer<
  typeof telegramBroadcastChannelDialogSnapshotValidator
>;
export type TelegramChannelDialogBase = Infer<
  typeof telegramChannelDialogBaseValidator
>;
export type TelegramChannelDialogSnapshotBase = Infer<
  typeof telegramChannelDialogSnapshotBaseValidator
>;
export type TelegramDialog = Infer<typeof telegramDialogValidator>;
export type TelegramDialogBase = Infer<typeof telegramDialogBaseValidator>;
export type TelegramDialogSnapshot = Infer<
  typeof telegramDialogSnapshotValidator
>;
export type TelegramDialogSnapshotBase = Infer<
  typeof telegramDialogSnapshotBaseValidator
>;
export type TelegramDialogSourceStatus = Infer<
  typeof telegramDialogSourceStatusValidator
>;
export type TelegramLegacyGroupDialog = Infer<
  typeof telegramLegacyGroupDialogValidator
>;
export type TelegramLegacyGroupDialogSnapshot = Infer<
  typeof telegramLegacyGroupDialogSnapshotValidator
>;
export type TelegramSupergroupDialog = Infer<
  typeof telegramSupergroupDialogValidator
>;
export type TelegramSupergroupDialogSnapshot = Infer<
  typeof telegramSupergroupDialogSnapshotValidator
>;
export type TelegramUserDialog = Infer<typeof telegramUserDialogValidator>;
export type TelegramUserDialogSnapshot = Infer<
  typeof telegramUserDialogSnapshotValidator
>;
