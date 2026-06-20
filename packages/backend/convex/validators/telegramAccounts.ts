import type { Infer } from "convex/values";
import { v } from "convex/values";
import { dialogSyncIdValidator } from "./dialogSync";
import { telegramIdValidator } from "./telegram";

export const dialogSyncStatusValidator = v.union(
  v.literal("idle"),
  v.literal("running"),
  v.literal("failed")
);

export const telegramAccountValidator = v.object({
  dialogSyncError: v.optional(v.string()),
  dialogSyncStatus: dialogSyncStatusValidator,
  displayName: v.string(),
  lastConnectedAt: v.number(),
  lastDialogSyncCompletedAt: v.optional(v.number()),
  lastDialogSyncId: v.optional(dialogSyncIdValidator),
  lastDialogSyncStartedAt: v.optional(v.number()),
  telegramAccountId: telegramIdValidator,
  username: v.optional(v.string()),
});

export type DialogSyncStatus = Infer<typeof dialogSyncStatusValidator>;
export type TelegramAccount = Infer<typeof telegramAccountValidator>;
