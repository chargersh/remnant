import { v } from "convex/values";
import { query } from "./_generated/server";
import { telegramDialogSourceStatusValidator } from "./validators/telegramDialogs";

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
      .withIndex("by_accountId_and_archivingEnabled_and_sourceStatus", (q) =>
        q.eq("accountId", args.accountId).eq("archivingEnabled", true)
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
