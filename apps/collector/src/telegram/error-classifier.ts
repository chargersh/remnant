import { Predicate, Redacted } from "effect";
import {
  AuthKeyError,
  BadMessageError,
  BadRequestError,
  CdnFileTamperedError,
  FileMigrateError,
  FloodTestPhoneWaitError,
  FloodWaitError,
  ForbiddenError,
  InvalidBufferError,
  InvalidChecksumError,
  MsgWaitError,
  NetworkMigrateError,
  NotFoundError,
  PhoneMigrateError,
  ReadCancelledError,
  RPCError,
  SecurityError,
  ServerError,
  SlowModeWaitError,
  TimedOutError,
  TypeNotFoundError,
  UnauthorizedError,
  UserMigrateError,
} from "telegram/errors";

export type TelegramFailureCategory =
  | "authorizationLost"
  | "cancelled"
  | "dcMigration"
  | "fileReferenceExpired"
  | "floodWait"
  | "invalidPeer"
  | "protocolOrIntegrity"
  | "serializationOrCollectorBug"
  | "slowModeWait"
  | "sourceUnavailable"
  | "telegramTransient"
  | "transport"
  | "unknown";

export type TelegramOperation =
  | "authorizationCheck"
  | "clientConnect"
  | "clientCreation"
  | "clientDisconnect"
  | "dialogList"
  | "fileDownload"
  | "historyFetch"
  | "messageLookup"
  | "peerResolution"
  | "selfLookup"
  | "updateFetch";

export interface TelegramSafePeerContext {
  readonly id: string;
  readonly kind: "channel" | "chat" | "user";
}

export interface TelegramErrorContext {
  readonly attempt?: number;
  readonly observedAt?: number;
  readonly operation: TelegramOperation;
  readonly peer?: TelegramSafePeerContext;
  readonly requestConstructor?: string;
}

export type TelegramSafeErrorCode =
  | "ACCESS_HASH_INVALID"
  | "AUTH_KEY_DUPLICATED"
  | "AUTH_KEY_INVALID"
  | "AUTH_KEY_UNREGISTERED"
  | "CHANNEL_INVALID"
  | "CHANNEL_PRIVATE"
  | "CHAT_ID_INVALID"
  | "CHAT_RESTRICTED"
  | "FILE_REFERENCE_EXPIRED"
  | "FILE_REFERENCE_INVALID"
  | "INPUT_USER_DEACTIVATED"
  | "MESSAGE_ID_INVALID"
  | "MSG_ID_INVALID"
  | "PEER_ID_INVALID"
  | "RPC_CALL_FAIL"
  | "RPC_MCGET_FAIL"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "USER_DEACTIVATED"
  | "USER_DEACTIVATED_BAN"
  | "USER_ID_INVALID"
  | "USERNAME_INVALID"
  | "USERNAME_NOT_OCCUPIED";

export interface TelegramSafeErrorSummary extends TelegramErrorContext {
  readonly category: TelegramFailureCategory;
  readonly dc?: number;
  readonly floodPremium?: boolean;
  readonly message: string;
  readonly rpcCode?: number;
  readonly safeCode?: TelegramSafeErrorCode;
  readonly seconds?: number;
  readonly transportCode?: TelegramTransportCode;
}

export interface TelegramFailure {
  /** Explicitly unwrap only at a trusted internal diagnostics boundary. */
  readonly cause: Redacted.Redacted<unknown>;
  /** The only representation of this failure that is safe to log or persist. */
  readonly summary: TelegramSafeErrorSummary;
}

export type TelegramTransportCode =
  | "ECONNABORTED"
  | "ECONNREFUSED"
  | "ECONNRESET"
  | "EHOSTUNREACH"
  | "ENETDOWN"
  | "ENETUNREACH"
  | "ENOTFOUND"
  | "EPIPE"
  | "ETIMEDOUT";

const authorizationCodes = new Set<TelegramSafeErrorCode>([
  "AUTH_KEY_DUPLICATED",
  "AUTH_KEY_INVALID",
  "AUTH_KEY_UNREGISTERED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
]);

const fileReferenceCodes = new Set<TelegramSafeErrorCode>([
  "FILE_REFERENCE_EXPIRED",
  "FILE_REFERENCE_INVALID",
]);

const invalidPeerCodes = new Set<TelegramSafeErrorCode>([
  "ACCESS_HASH_INVALID",
  "CHANNEL_INVALID",
  "CHAT_ID_INVALID",
  "PEER_ID_INVALID",
  "USER_ID_INVALID",
  "USERNAME_INVALID",
  "USERNAME_NOT_OCCUPIED",
]);

const sourceUnavailableCodes = new Set<TelegramSafeErrorCode>([
  "CHANNEL_PRIVATE",
  "CHAT_RESTRICTED",
  "INPUT_USER_DEACTIVATED",
  "MESSAGE_ID_INVALID",
  "MSG_ID_INVALID",
  "USER_DEACTIVATED",
  "USER_DEACTIVATED_BAN",
]);

const transientCodes = new Set<TelegramSafeErrorCode>([
  "RPC_CALL_FAIL",
  "RPC_MCGET_FAIL",
]);

const safeCodes = new Set<TelegramSafeErrorCode>([
  ...authorizationCodes,
  ...fileReferenceCodes,
  ...invalidPeerCodes,
  ...sourceUnavailableCodes,
  ...transientCodes,
]);

const transportCodes = new Set<TelegramTransportCode>([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

const categoryMessages: Record<TelegramFailureCategory, string> = {
  authorizationLost: "Telegram authorization is no longer valid.",
  cancelled: "The Telegram operation was cancelled.",
  dcMigration: "Telegram directed the operation to another data center.",
  fileReferenceExpired: "The Telegram file reference must be refreshed.",
  floodWait: "Telegram requires the operation to wait before retrying.",
  invalidPeer: "The Telegram peer reference is invalid or stale.",
  protocolOrIntegrity: "Telegram protocol or integrity validation failed.",
  serializationOrCollectorBug:
    "The collector could not construct or serialize the Telegram request.",
  slowModeWait: "Telegram slow mode requires the operation to wait.",
  sourceUnavailable: "The Telegram source is unavailable to this account.",
  telegramTransient: "Telegram reported a temporary server failure.",
  transport: "The Telegram connection was interrupted.",
  unknown: "The Telegram operation failed for an unclassified reason.",
};

const safeTokenCharacterPattern = /[A-Z0-9_]/;
const safeRequestConstructorPattern =
  /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;
const safePeerIdPattern = /^-?\d+$/;
const waitTokenPattern =
  /(?:^|[^A-Z0-9_])(FLOOD_PREMIUM_WAIT|FLOOD_TEST_PHONE_WAIT|FLOOD_WAIT|SLOWMODE_WAIT)_(\d+)(?:[^A-Z0-9_]|$)/;
const migrationTokenPattern =
  /(?:^|[^A-Z0-9_])(?:FILE|NETWORK|PHONE|USER)_MIGRATE_(\d+)(?:[^A-Z0-9_]|$)/;

const getStringProperty = (value: unknown, property: string) => {
  if (!Predicate.isObject(value)) {
    return;
  }

  const candidate = value[property];
  return typeof candidate === "string" ? candidate : undefined;
};

const hasSafeTokenBoundary = (character: string | undefined) =>
  character === undefined || !safeTokenCharacterPattern.test(character);

const extractSafeCode = (cause: unknown): TelegramSafeErrorCode | undefined => {
  const sources = [
    getStringProperty(cause, "errorMessage"),
    getStringProperty(cause, "message"),
  ];

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const code of safeCodes) {
      const start = source.indexOf(code);
      if (start < 0) {
        continue;
      }

      const before = source[start - 1];
      const after = source[start + code.length];

      if (hasSafeTokenBoundary(before) && hasSafeTokenBoundary(after)) {
        return code;
      }
    }
  }

  return;
};

const extractRpcCode = (cause: unknown) => {
  if (!(cause instanceof RPCError)) {
    return;
  }

  return typeof cause.code === "number" && Number.isFinite(cause.code)
    ? cause.code
    : undefined;
};

const extractTransportCode = (
  cause: unknown
): TelegramTransportCode | undefined => {
  const code = getStringProperty(cause, "code");
  return code && transportCodes.has(code as TelegramTransportCode)
    ? (code as TelegramTransportCode)
    : undefined;
};

const isDisconnectedError = (cause: unknown) => {
  const message = getStringProperty(cause, "message");
  return (
    message === "CONNECTION_NOT_INITED" ||
    message ===
      "Cannot send requests while disconnected. You need to call .connect()" ||
    message === "Cannot send requests while disconnected. Please reconnect." ||
    message === "Not connected"
  );
};

const isExplicitCancellation = (cause: unknown) =>
  cause instanceof ReadCancelledError ||
  (getStringProperty(cause, "name") === "AbortError" &&
    getStringProperty(cause, "message") !== undefined);

const isCollectorBug = (cause: unknown) =>
  cause instanceof TypeError ||
  cause instanceof RangeError ||
  getStringProperty(cause, "message") === "You can only invoke MTProtoRequests";

const sanitizeContext = (
  context: TelegramErrorContext
): TelegramErrorContext => {
  const attempt = context.attempt;
  const observedAt = context.observedAt;
  const requestConstructor = context.requestConstructor;
  const peer = context.peer;

  return {
    operation: context.operation,
    ...(attempt !== undefined && Number.isSafeInteger(attempt) && attempt > 0
      ? { attempt }
      : {}),
    ...(observedAt !== undefined &&
    Number.isSafeInteger(observedAt) &&
    observedAt >= 0
      ? { observedAt }
      : {}),
    ...(requestConstructor !== undefined &&
    requestConstructor.length <= 100 &&
    safeRequestConstructorPattern.test(requestConstructor)
      ? { requestConstructor }
      : {}),
    ...(peer && safePeerIdPattern.test(peer.id)
      ? { peer: { id: peer.id, kind: peer.kind } }
      : {}),
  };
};

const makeFailure = (
  cause: unknown,
  context: TelegramErrorContext,
  category: TelegramFailureCategory,
  metadata: Omit<
    Partial<TelegramSafeErrorSummary>,
    keyof TelegramErrorContext | "category" | "message"
  > = {}
): TelegramFailure => {
  const safeContext = sanitizeContext(context);

  return {
    cause: Redacted.make(cause, { label: "TelegramErrorCause" }),
    summary: {
      ...safeContext,
      observedAt: safeContext.observedAt ?? Date.now(),
      category,
      message: categoryMessages[category],
      ...metadata,
    },
  };
};

const extractWaitToken = (source: string) => {
  const match = source.match(waitTokenPattern);
  const seconds = Number(match?.[2]);

  if (!(match && Number.isSafeInteger(seconds) && seconds >= 0)) {
    return;
  }

  return {
    category:
      match[1] === "SLOWMODE_WAIT"
        ? ("slowModeWait" as const)
        : ("floodWait" as const),
    ...(match[1] === "FLOOD_PREMIUM_WAIT" ? { floodPremium: true } : {}),
    seconds,
  };
};

const extractMigrationToken = (source: string) => {
  const match = source.match(migrationTokenPattern);
  const dc = Number(match?.[1]);

  return match && Number.isSafeInteger(dc) && dc > 0
    ? { category: "dcMigration" as const, dc }
    : undefined;
};

const extractWaitOrMigrationToken = (cause: unknown) => {
  const sources = [
    getStringProperty(cause, "errorMessage"),
    getStringProperty(cause, "message"),
  ];

  for (const source of sources) {
    if (source) {
      const metadata =
        extractWaitToken(source) ?? extractMigrationToken(source);
      if (metadata) {
        return metadata;
      }
    }
  }

  return;
};

const classifyWaitOrMigration = (
  cause: unknown,
  context: TelegramErrorContext
) => {
  if (cause instanceof SlowModeWaitError) {
    return makeFailure(cause, context, "slowModeWait", {
      rpcCode: extractRpcCode(cause),
      seconds: cause.seconds,
    });
  }

  if (
    cause instanceof FloodWaitError ||
    cause instanceof FloodTestPhoneWaitError
  ) {
    return makeFailure(cause, context, "floodWait", {
      rpcCode: extractRpcCode(cause),
      seconds: cause.seconds,
    });
  }

  if (
    cause instanceof FileMigrateError ||
    cause instanceof PhoneMigrateError ||
    cause instanceof NetworkMigrateError ||
    cause instanceof UserMigrateError
  ) {
    return makeFailure(cause, context, "dcMigration", {
      dc: cause.newDc,
      rpcCode: extractRpcCode(cause),
    });
  }

  return;
};

const classifySafeCode = (
  cause: unknown,
  context: TelegramErrorContext,
  safeCode: TelegramSafeErrorCode | undefined
) => {
  if (!safeCode) {
    return;
  }

  const rpcCode = extractRpcCode(cause);

  if (fileReferenceCodes.has(safeCode)) {
    return makeFailure(cause, context, "fileReferenceExpired", {
      rpcCode,
      safeCode,
    });
  }

  if (authorizationCodes.has(safeCode)) {
    return makeFailure(cause, context, "authorizationLost", {
      rpcCode,
      safeCode,
    });
  }

  if (invalidPeerCodes.has(safeCode)) {
    return makeFailure(cause, context, "invalidPeer", {
      rpcCode,
      safeCode,
    });
  }

  if (sourceUnavailableCodes.has(safeCode)) {
    return makeFailure(cause, context, "sourceUnavailable", {
      rpcCode,
      safeCode,
    });
  }

  if (transientCodes.has(safeCode)) {
    return makeFailure(cause, context, "telegramTransient", {
      rpcCode,
      safeCode,
    });
  }

  return;
};

const isProtocolOrIntegrityError = (cause: unknown) =>
  cause instanceof CdnFileTamperedError ||
  cause instanceof TypeNotFoundError ||
  cause instanceof InvalidBufferError ||
  cause instanceof InvalidChecksumError ||
  cause instanceof BadMessageError ||
  cause instanceof SecurityError;

const isTelegramTransientError = (cause: unknown) =>
  cause instanceof ServerError ||
  cause instanceof TimedOutError ||
  cause instanceof MsgWaitError ||
  (cause instanceof RPCError &&
    (cause.code === 500 ||
      cause.code === 503 ||
      cause.code === -500 ||
      cause.code === -503));

const classifyBroadErrorClass = (
  cause: unknown,
  context: TelegramErrorContext
) => {
  if (cause instanceof UnauthorizedError || cause instanceof AuthKeyError) {
    return makeFailure(cause, context, "authorizationLost", {
      rpcCode: extractRpcCode(cause),
    });
  }

  if (isProtocolOrIntegrityError(cause)) {
    return makeFailure(cause, context, "protocolOrIntegrity");
  }

  if (isTelegramTransientError(cause)) {
    return makeFailure(cause, context, "telegramTransient", {
      rpcCode: extractRpcCode(cause),
    });
  }

  if (cause instanceof ForbiddenError || cause instanceof NotFoundError) {
    return makeFailure(cause, context, "sourceUnavailable", {
      rpcCode: extractRpcCode(cause),
    });
  }

  return;
};

/**
 * Converts a GramJS, transport, or local request failure into an actionable
 * category and a deliberately small summary. Callers must log `summary`, not
 * `cause` or the complete returned object.
 */
export const classifyTelegramError = (
  cause: unknown,
  context: TelegramErrorContext
): TelegramFailure => {
  if (isExplicitCancellation(cause)) {
    return makeFailure(cause, context, "cancelled");
  }

  const waitOrMigration = classifyWaitOrMigration(cause, context);
  if (waitOrMigration) {
    return waitOrMigration;
  }

  const waitOrMigrationToken = extractWaitOrMigrationToken(cause);
  if (waitOrMigrationToken) {
    const { category, ...metadata } = waitOrMigrationToken;
    return makeFailure(cause, context, category, {
      ...metadata,
      rpcCode: extractRpcCode(cause),
    });
  }

  const safeCodeFailure = classifySafeCode(
    cause,
    context,
    extractSafeCode(cause)
  );
  if (safeCodeFailure) {
    return safeCodeFailure;
  }

  const broadErrorClass = classifyBroadErrorClass(cause, context);
  if (broadErrorClass) {
    return broadErrorClass;
  }

  const transportCode = extractTransportCode(cause);
  if (transportCode || isDisconnectedError(cause)) {
    return makeFailure(cause, context, "transport", {
      ...(transportCode ? { transportCode } : {}),
    });
  }

  if (isCollectorBug(cause)) {
    return makeFailure(cause, context, "serializationOrCollectorBug");
  }

  // A broad BadRequestError can represent either permanent input failure or a
  // recoverable file-reference problem. Only the allow-listed cases above are
  // actionable; guessing here would create unsafe retries.
  if (cause instanceof BadRequestError || cause instanceof RPCError) {
    return makeFailure(cause, context, "unknown", {
      rpcCode: extractRpcCode(cause),
    });
  }

  return makeFailure(cause, context, "unknown");
};
