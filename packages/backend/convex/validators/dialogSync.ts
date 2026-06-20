import type { Infer } from "convex/values";
import { v } from "convex/values";

export const dialogSyncIdValidator = v.string();

export const dialogSyncRunStatusValidator = v.union(
  v.literal("running"),
  v.literal("reconciling"),
  v.literal("completed"),
  v.literal("failed")
);

export const dialogSyncRunValidator = v.object({
  accountId: v.id("telegramAccounts"),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  markedMissingCount: v.number(),
  receivedBatchCount: v.number(),
  receivedBatchIndexSum: v.number(),
  receivedDialogCount: v.number(),
  startedAt: v.number(),
  status: dialogSyncRunStatusValidator,
  syncId: dialogSyncIdValidator,
});

export const dialogSyncBatchValidator = v.object({
  batchIndex: v.number(),
  contentHash: v.string(),
  dialogCount: v.number(),
  receivedAt: v.number(),
  runId: v.id("dialogSyncRuns"),
});

export type DialogSyncBatch = Infer<typeof dialogSyncBatchValidator>;
export type DialogSyncId = Infer<typeof dialogSyncIdValidator>;
export type DialogSyncRun = Infer<typeof dialogSyncRunValidator>;
export type DialogSyncRunStatus = Infer<typeof dialogSyncRunStatusValidator>;
