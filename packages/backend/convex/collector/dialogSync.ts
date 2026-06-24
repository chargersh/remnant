import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { collectorMutation } from "../functions";
import { dialogSyncIdValidator } from "../validators/dialogSync";
import { telegramIdValidator } from "../validators/telegram";
import { telegramAccountProfileValidator } from "../validators/telegramAccounts";
import {
  type TelegramDialogSnapshot,
  telegramDialogSnapshotValidator,
} from "../validators/telegramDialogs";

const dialogBatchSize = 100;

const toHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

const dialogBatchContentHash = async (
  dialogs: readonly TelegramDialogSnapshot[]
) => {
  const content = JSON.stringify(
    dialogs
      .map(
        (dialog) => [dialog.peerKind, dialog.peerId, dialog.dialogId] as const
      )
      .sort(
        (
          [leftKind, leftPeerId, leftDialogId],
          [rightKind, rightPeerId, rightDialogId]
        ) => {
          if (leftKind !== rightKind) {
            return leftKind.localeCompare(rightKind);
          }

          if (leftPeerId !== rightPeerId) {
            return leftPeerId.localeCompare(rightPeerId);
          }

          return leftDialogId.localeCompare(rightDialogId);
        }
      )
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content)
  );

  return toHex(digest);
};

const requireAccount = async (ctx: MutationCtx, telegramAccountId: string) => {
  const account = await ctx.db
    .query("telegramAccounts")
    .withIndex("by_telegramAccountId", (query) =>
      query.eq("telegramAccountId", telegramAccountId)
    )
    .unique();

  if (!account) {
    throw new ConvexError("Telegram account not found");
  }

  return account;
};

const requireCurrentRun = async (
  ctx: MutationCtx,
  telegramAccountId: string,
  syncId: string
) => {
  const account = await requireAccount(ctx, telegramAccountId);

  if (account.lastDialogSyncId !== syncId) {
    throw new ConvexError("Dialog sync is stale");
  }

  const run = await ctx.db
    .query("dialogSyncRuns")
    .withIndex("by_accountId_and_syncId", (query) =>
      query.eq("accountId", account._id).eq("syncId", syncId)
    )
    .unique();

  if (!run) {
    throw new ConvexError("Dialog sync run not found");
  }

  return { account, run };
};

const persistentDialogFields = (dialog: TelegramDialogSnapshot) => {
  const {
    unreadCount: _unreadCount,
    unreadMentionsCount: _unreadMentionsCount,
    ...fields
  } = dialog;

  return fields;
};

const upsertDialog = async (
  ctx: MutationCtx,
  accountId: Id<"telegramAccounts">,
  syncId: string,
  observedAt: number,
  dialog: TelegramDialogSnapshot
) => {
  const existing = await ctx.db
    .query("telegramDialogs")
    .withIndex("by_accountId_and_peerKind_and_peerId", (query) =>
      query
        .eq("accountId", accountId)
        .eq("peerKind", dialog.peerKind)
        .eq("peerId", dialog.peerId)
    )
    .unique();
  const telegramFields = persistentDialogFields(dialog);

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...telegramFields,
      lastSeenAt: observedAt,
      lastSeenSyncId: syncId,
      metadataUpdatedAt: observedAt,
      missingSince: undefined,
      sourceStatus: "active",
    });
    return;
  }

  await ctx.db.insert("telegramDialogs", {
    ...telegramFields,
    accountId,
    archivingEnabled: false,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    lastSeenSyncId: syncId,
    metadataUpdatedAt: observedAt,
    sourceStatus: "active",
  });
};

export const start = collectorMutation({
  args: {
    account: telegramAccountProfileValidator,
    startedAt: v.number(),
    syncId: dialogSyncIdValidator,
  },
  returns: v.object({
    runId: v.id("dialogSyncRuns"),
  }),
  handler: async (ctx, args) => {
    const existingAccount = await ctx.db
      .query("telegramAccounts")
      .withIndex("by_telegramAccountId", (query) =>
        query.eq("telegramAccountId", args.account.telegramAccountId)
      )
      .unique();
    const accountId = existingAccount
      ? existingAccount._id
      : await ctx.db.insert("telegramAccounts", {
          dialogSyncStatus: "idle",
          displayName: args.account.displayName,
          lastConnectedAt: args.startedAt,
          telegramAccountId: args.account.telegramAccountId,
          username: args.account.username,
        });
    const existingRun = await ctx.db
      .query("dialogSyncRuns")
      .withIndex("by_accountId_and_syncId", (query) =>
        query.eq("accountId", accountId).eq("syncId", args.syncId)
      )
      .unique();

    if (existingRun) {
      if (existingRun.status === "running") {
        return { runId: existingRun._id };
      }

      throw new ConvexError("Dialog sync ID was already used");
    }

    if (existingAccount?.lastDialogSyncId) {
      const previousSyncId = existingAccount.lastDialogSyncId;
      const previousRun = await ctx.db
        .query("dialogSyncRuns")
        .withIndex("by_accountId_and_syncId", (query) =>
          query.eq("accountId", accountId).eq("syncId", previousSyncId)
        )
        .unique();

      if (
        previousRun &&
        (previousRun.status === "running" ||
          previousRun.status === "reconciling")
      ) {
        await ctx.db.patch(previousRun._id, {
          error: "Superseded by a newer dialog sync",
          status: "failed",
        });
      }
    }

    const runId = await ctx.db.insert("dialogSyncRuns", {
      accountId,
      markedMissingCount: 0,
      receivedBatchCount: 0,
      receivedBatchIndexSum: 0,
      receivedDialogCount: 0,
      startedAt: args.startedAt,
      status: "running",
      syncId: args.syncId,
    });

    await ctx.db.patch(accountId, {
      dialogSyncError: undefined,
      dialogSyncStatus: "running",
      displayName: args.account.displayName,
      lastConnectedAt: args.startedAt,
      lastDialogSyncId: args.syncId,
      lastDialogSyncStartedAt: args.startedAt,
      username: args.account.username,
    });

    return { runId };
  },
});

export const ingestBatch = collectorMutation({
  args: {
    batchIndex: v.number(),
    dialogs: v.array(telegramDialogSnapshotValidator),
    observedAt: v.number(),
    syncId: dialogSyncIdValidator,
    telegramAccountId: telegramIdValidator,
  },
  returns: v.object({
    processed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.batchIndex) ||
      args.batchIndex < 0 ||
      args.dialogs.length === 0 ||
      args.dialogs.length > dialogBatchSize
    ) {
      throw new ConvexError("Invalid dialog batch");
    }

    const { account, run } = await requireCurrentRun(
      ctx,
      args.telegramAccountId,
      args.syncId
    );

    if (run.status !== "running") {
      throw new ConvexError("Dialog sync is not accepting batches");
    }

    const existingBatch = await ctx.db
      .query("dialogSyncBatches")
      .withIndex("by_runId_and_batchIndex", (query) =>
        query.eq("runId", run._id).eq("batchIndex", args.batchIndex)
      )
      .unique();
    const contentHash = await dialogBatchContentHash(args.dialogs);

    if (existingBatch) {
      if (
        existingBatch.dialogCount !== args.dialogs.length ||
        existingBatch.contentHash !== contentHash
      ) {
        throw new ConvexError("Dialog batch retry does not match");
      }

      return { processed: false };
    }

    for (const dialog of args.dialogs) {
      await upsertDialog(
        ctx,
        account._id,
        args.syncId,
        args.observedAt,
        dialog
      );
    }

    await ctx.db.insert("dialogSyncBatches", {
      batchIndex: args.batchIndex,
      contentHash,
      dialogCount: args.dialogs.length,
      receivedAt: args.observedAt,
      runId: run._id,
    });
    await ctx.db.patch(run._id, {
      receivedBatchCount: run.receivedBatchCount + 1,
      receivedBatchIndexSum: run.receivedBatchIndexSum + args.batchIndex,
      receivedDialogCount: run.receivedDialogCount + args.dialogs.length,
    });

    return { processed: true };
  },
});

export const complete = collectorMutation({
  args: {
    completedAt: v.number(),
    syncId: dialogSyncIdValidator,
    telegramAccountId: telegramIdValidator,
    totalBatches: v.number(),
    totalDialogs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.totalBatches) ||
      args.totalBatches < 0 ||
      !Number.isInteger(args.totalDialogs) ||
      args.totalDialogs < 0
    ) {
      throw new ConvexError("Invalid dialog sync totals");
    }

    const { run } = await requireCurrentRun(
      ctx,
      args.telegramAccountId,
      args.syncId
    );

    if (run.status === "completed" || run.status === "reconciling") {
      return null;
    }

    if (
      run.status !== "running" ||
      run.receivedBatchCount !== args.totalBatches ||
      run.receivedBatchIndexSum !==
        (args.totalBatches * (args.totalBatches - 1)) / 2 ||
      run.receivedDialogCount !== args.totalDialogs
    ) {
      throw new ConvexError("Dialog sync is incomplete");
    }

    await ctx.db.patch(run._id, {
      status: "reconciling",
    });
    await ctx.scheduler.runAfter(0, internal.collector.dialogSync.reconcile, {
      cursor: null,
      completedAt: args.completedAt,
      runId: run._id,
    });

    return null;
  },
});

export const reconcile = internalMutation({
  args: {
    completedAt: v.number(),
    cursor: paginationOptsValidator.fields.cursor,
    runId: v.id("dialogSyncRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);

    if (run?.status !== "reconciling") {
      return null;
    }

    const page = await ctx.db
      .query("telegramDialogs")
      .withIndex("by_accountId_and_peerKind_and_peerId", (query) =>
        query.eq("accountId", run.accountId)
      )
      .paginate({
        cursor: args.cursor,
        numItems: dialogBatchSize,
      });
    let markedMissingCount = 0;

    for (const dialog of page.page) {
      if (
        dialog.sourceStatus === "active" &&
        dialog.lastSeenSyncId !== run.syncId &&
        dialog.lastSeenAt <= run.startedAt
      ) {
        await ctx.db.patch(dialog._id, {
          missingSince: args.completedAt,
          sourceStatus: "missing",
        });
        markedMissingCount += 1;
      }
    }

    if (!page.isDone) {
      await ctx.db.patch(run._id, {
        markedMissingCount: run.markedMissingCount + markedMissingCount,
      });
      await ctx.scheduler.runAfter(0, internal.collector.dialogSync.reconcile, {
        completedAt: args.completedAt,
        cursor: page.continueCursor,
        runId: run._id,
      });
      return null;
    }

    const finalMarkedMissingCount = run.markedMissingCount + markedMissingCount;
    await ctx.db.patch(run._id, {
      completedAt: args.completedAt,
      markedMissingCount: finalMarkedMissingCount,
      status: "completed",
    });

    const account = await ctx.db.get(run.accountId);

    if (account?.lastDialogSyncId === run.syncId) {
      await ctx.db.patch(account._id, {
        dialogSyncError: undefined,
        dialogSyncStatus: "idle",
        lastDialogSyncCompletedAt: args.completedAt,
      });
    }

    return null;
  },
});
