import { api } from "@remnant/backend/convex/_generated/api";
import { env } from "@remnant/env/collector";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { Data, Effect, Schedule } from "effect";
import { TelegramClient } from "../telegram/client";
import type { TelegramDialog } from "../telegram/dialogs";
import { getTelegramDialogs } from "../telegram/dialogs";

const dialogBatchSize = 100;
const convex = new ConvexHttpClient(env.CONVEX_URL);

export interface TelegramAccountProfile {
  readonly displayName: string;
  readonly telegramAccountId: string;
  readonly username?: string;
}

export class ConvexDialogSyncError extends Data.TaggedError(
  "ConvexDialogSyncError"
)<{
  readonly cause: unknown;
  readonly operation: "complete" | "ingestBatch" | "start";
}> {}

export class TelegramAccountLookupError extends Data.TaggedError(
  "TelegramAccountLookupError"
)<{
  readonly cause: unknown;
}> {}

const retryPolicy = {
  schedule: Schedule.jittered(Schedule.exponential("250 millis")),
  times: 5,
  while: (error: ConvexDialogSyncError) =>
    !(error.cause instanceof ConvexError),
} as const;

const runMutation = <A>(
  operation: ConvexDialogSyncError["operation"],
  mutation: () => Promise<A>
) =>
  Effect.tryPromise({
    try: mutation,
    catch: (cause) => new ConvexDialogSyncError({ cause, operation }),
  }).pipe(Effect.retry(retryPolicy));

const chunksOf = <A>(items: readonly A[], size: number): readonly A[][] => {
  const chunks: A[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

export const syncTelegramDialogs = Effect.fn("ConvexDialogSync.sync")(
  function* (
    account: TelegramAccountProfile,
    dialogs: readonly TelegramDialog[]
  ) {
    const syncId = crypto.randomUUID();
    const startedAt = Date.now();
    const batches = chunksOf(dialogs, dialogBatchSize);

    yield* runMutation("start", () =>
      convex.mutation(api.collector.dialogSync.start, {
        account,
        apiKey: env.COLLECTOR_API_KEY,
        startedAt,
        syncId,
      })
    );

    yield* Effect.forEach(
      batches,
      (batch, batchIndex) =>
        runMutation("ingestBatch", () =>
          convex.mutation(api.collector.dialogSync.ingestBatch, {
            apiKey: env.COLLECTOR_API_KEY,
            batchIndex,
            dialogs: batch,
            observedAt: Date.now(),
            syncId,
            telegramAccountId: account.telegramAccountId,
          })
        ),
      { concurrency: 1, discard: true }
    );

    yield* runMutation("complete", () =>
      convex.mutation(api.collector.dialogSync.complete, {
        apiKey: env.COLLECTOR_API_KEY,
        completedAt: Date.now(),
        syncId,
        telegramAccountId: account.telegramAccountId,
        totalBatches: batches.length,
        totalDialogs: dialogs.length,
      })
    );

    return { syncId };
  }
);

export const collectAndSyncTelegramDialogs = Effect.fn(
  "ConvexDialogSync.collectAndSync"
)(function* () {
  const client = yield* TelegramClient;
  const account = yield* Effect.tryPromise({
    try: () => client.getMe(),
    catch: (cause) => new TelegramAccountLookupError({ cause }),
  });
  const displayName = [account.firstName, account.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const dialogs = yield* getTelegramDialogs();

  return yield* syncTelegramDialogs(
    {
      displayName: displayName || account.username || account.id.toString(),
      telegramAccountId: account.id.toString(),
      ...(account.username === undefined ? {} : { username: account.username }),
    },
    dialogs
  );
});
