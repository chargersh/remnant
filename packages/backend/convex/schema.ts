import { defineSchema, defineTable } from "convex/server";
import {
  dialogSyncBatchValidator,
  dialogSyncRunValidator,
} from "./validators/dialogSync";
import { telegramAccountValidator } from "./validators/telegramAccounts";
import { telegramDialogValidator } from "./validators/telegramDialogs";

export default defineSchema({
  dialogSyncBatches: defineTable(dialogSyncBatchValidator).index(
    "by_runId_and_batchIndex",
    ["runId", "batchIndex"]
  ),
  dialogSyncRuns: defineTable(dialogSyncRunValidator)
    .index("by_syncId", ["syncId"])
    .index("by_accountId_and_syncId", ["accountId", "syncId"])
    .index("by_accountId_and_startedAt", ["accountId", "startedAt"]),
  telegramAccounts: defineTable(telegramAccountValidator).index(
    "by_telegramAccountId",
    ["telegramAccountId"]
  ),
  telegramDialogs: defineTable(telegramDialogValidator)
    .index("by_accountId_and_peerKind_and_peerId", [
      "accountId",
      "peerKind",
      "peerId",
    ])
    .index("by_accountId_and_sourceStatus", ["accountId", "sourceStatus"])
    .index("by_accountId_and_trackingEnabled_and_sourceStatus", [
      "accountId",
      "trackingEnabled",
      "sourceStatus",
    ])
    .index("by_accountId_and_type_and_sourceStatus", [
      "accountId",
      "type",
      "sourceStatus",
    ]),
});
