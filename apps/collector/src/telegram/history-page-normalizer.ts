import { Effect } from "effect";
import type { TelegramHistoryPage } from "./history";
import type {
  TelegramMessageEnvelope,
  TelegramMessageFileDiscovery,
  TelegramNormalizationWarning,
} from "./message-contracts";
import {
  type NormalizeTelegramMessageOptions,
  normalizeTelegramMessage,
} from "./message-normalizer";
import {
  encodeTelegramRawValue,
  TELEGRAM_RAW_FORMAT_VERSION,
  type TelegramRawValue,
} from "./raw-encoder";

const NORMALIZATION_CONCURRENCY = 4;

export interface TelegramHistoryPageEnvelope {
  readonly discoveredFiles: readonly TelegramMessageFileDiscovery[];
  readonly estimatedMessageCount: number;
  readonly messageCountIsInexact: boolean;
  readonly messages: readonly TelegramMessageEnvelope[];
  readonly nextOffsetId?: number;
  readonly raw: TelegramRawValue;
  readonly rawFormatVersion: 1;
  readonly warnings: readonly TelegramNormalizationWarning[];
}

export const normalizeTelegramHistoryPage = Effect.fn(
  "TelegramHistoryPage.normalize"
)(function* (
  page: TelegramHistoryPage,
  options: NormalizeTelegramMessageOptions
) {
  const raw = yield* encodeTelegramRawValue(page.raw);
  const messages = yield* Effect.forEach(
    page.messages,
    (message) => normalizeTelegramMessage(message, options),
    { concurrency: NORMALIZATION_CONCURRENCY }
  );

  return {
    discoveredFiles: messages.flatMap((message) => message.discoveredFiles),
    estimatedMessageCount: page.estimatedMessageCount,
    messageCountIsInexact: page.messageCountIsInexact,
    messages,
    ...(page.nextOffsetId === undefined
      ? {}
      : { nextOffsetId: page.nextOffsetId }),
    raw,
    rawFormatVersion: TELEGRAM_RAW_FORMAT_VERSION,
    warnings: messages.flatMap((message) => message.warnings),
  } satisfies TelegramHistoryPageEnvelope;
});
