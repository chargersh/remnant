import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  telegramAvailabilityValidator,
  telegramDialogTypeValidator,
  telegramPeerKindValidator,
} from "./validators/telegram";
import { telegramDialogSourceStatusValidator } from "./validators/telegramDialogs";

export const list = query({
  args: {
    accountId: v.id("telegramAccounts"),
  },
  returns: v.array(
    v.object({
      archived: v.boolean(),
      availability: v.optional(telegramAvailabilityValidator),
      dialogId: v.id("telegramDialogs"),
      firstSeenAt: v.number(),
      folderId: v.optional(v.number()),
      isBot: v.optional(v.boolean()),
      isDeleted: v.optional(v.boolean()),
      isSelf: v.optional(v.boolean()),
      lastSeenAt: v.number(),
      missingSince: v.optional(v.number()),
      name: v.string(),
      peerKind: telegramPeerKindValidator,
      pinned: v.boolean(),
      sourceStatus: telegramDialogSourceStatusValidator,
      telegramDialogId: v.string(),
      trackingEnabled: v.boolean(),
      type: telegramDialogTypeValidator,
      username: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const dialogs = await ctx.db
      .query("telegramDialogs")
      .withIndex("by_accountId_and_sourceStatus", (q) =>
        q.eq("accountId", args.accountId)
      )
      .collect();

    return dialogs
      .sort((left, right) => {
        if (left.pinned !== right.pinned) {
          return left.pinned ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      })
      .map((dialog) => ({
        archived: dialog.archived,
        availability:
          "availability" in dialog ? dialog.availability : undefined,
        dialogId: dialog._id,
        firstSeenAt: dialog.firstSeenAt,
        folderId: dialog.folderId,
        isBot: "isBot" in dialog ? dialog.isBot : undefined,
        isDeleted: "isDeleted" in dialog ? dialog.isDeleted : undefined,
        isSelf: "isSelf" in dialog ? dialog.isSelf : undefined,
        lastSeenAt: dialog.lastSeenAt,
        missingSince: dialog.missingSince,
        name: dialog.name,
        peerKind: dialog.peerKind,
        pinned: dialog.pinned,
        sourceStatus: dialog.sourceStatus,
        telegramDialogId: dialog.dialogId,
        trackingEnabled: dialog.trackingEnabled,
        type: dialog.type,
        username: "username" in dialog ? dialog.username : undefined,
      }));
  },
});

export const listTracked = query({
  args: {
    accountId: v.id("telegramAccounts"),
  },
  returns: v.array(
    v.object({
      dialogId: v.id("telegramDialogs"),
      name: v.string(),
      peerKind: v.union(
        v.literal("user"),
        v.literal("chat"),
        v.literal("channel")
      ),
      sourceStatus: telegramDialogSourceStatusValidator,
      telegramDialogId: v.string(),
      type: v.union(
        v.literal("user"),
        v.literal("group"),
        v.literal("channel")
      ),
      username: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const dialogs = await ctx.db
      .query("telegramDialogs")
      .withIndex("by_accountId_and_trackingEnabled_and_sourceStatus", (q) =>
        q.eq("accountId", args.accountId).eq("trackingEnabled", true)
      )
      .collect();

    return dialogs
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((dialog) => ({
        dialogId: dialog._id,
        name: dialog.name,
        peerKind: dialog.peerKind,
        sourceStatus: dialog.sourceStatus,
        telegramDialogId: dialog.dialogId,
        type: dialog.type,
        username: "username" in dialog ? dialog.username : undefined,
      }));
  },
});
