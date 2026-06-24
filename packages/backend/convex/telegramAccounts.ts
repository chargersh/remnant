import { v } from "convex/values";
import { query } from "./_generated/server";
import { dialogSyncStatusValidator } from "./validators/telegramAccounts";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id("telegramAccounts"),
      dialogSyncStatus: dialogSyncStatusValidator,
      displayName: v.string(),
      lastConnectedAt: v.number(),
      telegramAccountId: v.string(),
      username: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    const accounts = await ctx.db.query("telegramAccounts").collect();

    return accounts
      .sort((left, right) => right.lastConnectedAt - left.lastConnectedAt)
      .map((account) => ({
        accountId: account._id,
        dialogSyncStatus: account.dialogSyncStatus,
        displayName: account.displayName,
        lastConnectedAt: account.lastConnectedAt,
        telegramAccountId: account.telegramAccountId,
        username: account.username,
      }));
  },
});
