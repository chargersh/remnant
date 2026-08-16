import { describe, expect, test } from "bun:test";
import bigInt from "big-integer";
import { Redacted } from "effect";
import { Api } from "telegram";
import {
  AuthKeyError,
  BadMessageError,
  BadRequestError,
  CdnFileTamperedError,
  EmailUnconfirmedError,
  FileMigrateError,
  FloodError,
  FloodTestPhoneWaitError,
  FloodWaitError,
  ForbiddenError,
  InvalidBufferError,
  InvalidChecksumError,
  InvalidDCError,
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
import {
  classifyTelegramError,
  type TelegramFailureCategory,
} from "./error-classifier";

const request = new Api.messages.GetHistory({
  addOffset: 0,
  hash: bigInt.zero,
  limit: 1,
  maxId: 0,
  minId: 0,
  offsetDate: 0,
  offsetId: 0,
  peer: new Api.InputPeerSelf(),
});

const context = {
  observedAt: 1_755_000_000_000,
  operation: "historyFetch" as const,
  peer: { id: "-100123456789", kind: "channel" as const },
  requestConstructor: "messages.GetHistory",
};

const classify = (cause: unknown) => classifyTelegramError(cause, context);

const makeTypeNotFoundError = () => {
  const originalAlert = globalThis.alert;
  globalThis.alert = () => undefined;

  try {
    return new TypeNotFoundError(123, Buffer.from("secret-buffer"));
  } finally {
    globalThis.alert = originalAlert;
  }
};

describe("classifyTelegramError", () => {
  test.each([
    [new SlowModeWaitError({ capture: 12, request }), "slowModeWait", 12],
    [new FloodWaitError({ capture: 34, request }), "floodWait", 34],
    [new FloodTestPhoneWaitError({ capture: 56, request }), "floodWait", 56],
  ] satisfies readonly [
    unknown,
    TelegramFailureCategory,
    number,
  ][])("classifies specialized waits without losing their delay", (cause, category, seconds) => {
    const failure = classify(cause);

    expect(failure.summary).toMatchObject({ category, seconds });
    expect(Redacted.value(failure.cause)).toBe(cause);
  });

  test.each([
    [new FileMigrateError({ capture: 2, request }), 2],
    [new NetworkMigrateError({ capture: 3, request }), 3],
    [new PhoneMigrateError({ capture: 4, request }), 4],
    [new UserMigrateError({ capture: 5, request }), 5],
  ])("classifies specialized migrations", (cause, dc) => {
    expect(classify(cause).summary).toMatchObject({
      category: "dcMigration",
      dc,
    });
  });

  test("recovers allow-listed tokens before broad RPC classes", () => {
    const fileReference = new BadRequestError(
      "FILE_REFERENCE_EXPIRED",
      request,
      400
    );
    const authorization = new UnauthorizedError(
      "SESSION_REVOKED",
      request,
      401
    );

    expect(fileReference.errorMessage).toBe("BAD_REQUEST");
    expect(classify(fileReference).summary).toMatchObject({
      category: "fileReferenceExpired",
      rpcCode: 400,
      safeCode: "FILE_REFERENCE_EXPIRED",
    });
    expect(classify(authorization).summary).toMatchObject({
      category: "authorizationLost",
      rpcCode: 401,
      safeCode: "SESSION_REVOKED",
    });
  });

  test.each([
    ["CHANNEL_PRIVATE", "sourceUnavailable"],
    ["MESSAGE_ID_INVALID", "sourceUnavailable"],
    ["PEER_ID_INVALID", "invalidPeer"],
    ["ACCESS_HASH_INVALID", "invalidPeer"],
    ["RPC_CALL_FAIL", "telegramTransient"],
    ["RPC_MCGET_FAIL", "telegramTransient"],
  ] satisfies readonly [
    string,
    TelegramFailureCategory,
  ][])("maps safe Telegram tokens to actionable categories", (token, category) => {
    const cause = new BadRequestError(token, request, 400);
    expect(classify(cause).summary.category).toBe(category);
  });

  test("extracts patterned wait and migration metadata from generic RPC errors", () => {
    expect(
      classify(new RPCError("FLOOD_PREMIUM_WAIT_73", request, 420)).summary
    ).toMatchObject({
      category: "floodWait",
      floodPremium: true,
      seconds: 73,
    });
    expect(
      classify(new RPCError("FILE_MIGRATE_4", request, 303)).summary
    ).toMatchObject({ category: "dcMigration", dc: 4 });
  });

  test.each([
    [new UnauthorizedError("", request), "authorizationLost"],
    [new AuthKeyError("", request), "authorizationLost"],
    [new ForbiddenError("", request), "sourceUnavailable"],
    [new NotFoundError("", request), "sourceUnavailable"],
    [new ServerError("", request), "telegramTransient"],
    [new TimedOutError("", request), "telegramTransient"],
    [new MsgWaitError({ request }), "telegramTransient"],
  ] satisfies readonly [
    unknown,
    TelegramFailureCategory,
  ][])("classifies broad RPC error families conservatively", (cause, category) => {
    expect(classify(cause).summary.category).toBe(category);
  });

  test.each([
    makeTypeNotFoundError(),
    new InvalidChecksumError(1, 2),
    new InvalidBufferError(Buffer.from("secret-buffer")),
    new SecurityError("secret-security-detail"),
    new CdnFileTamperedError(),
    new BadMessageError(request, 16),
  ])("classifies protocol and integrity errors", (cause) => {
    expect(classify(cause).summary.category).toBe("protocolOrIntegrity");
  });

  test("classifies explicit cancellation, transport errors, and collector bugs", () => {
    const transport = Object.assign(new Error("secret socket detail"), {
      code: "ECONNRESET",
    });

    expect(classify(new ReadCancelledError()).summary.category).toBe(
      "cancelled"
    );
    expect(classify(transport).summary).toMatchObject({
      category: "transport",
      transportCode: "ECONNRESET",
    });
    expect(classify(new TypeError("secret bad request")).summary.category).toBe(
      "serializationOrCollectorBug"
    );
  });

  test("keeps unsupported and ambiguous RPC errors unknown", () => {
    const cases = [
      new RPCError("NEW_SERVER_BEHAVIOR", request, 499),
      new BadRequestError("SOMETHING_NEW", request, 400),
      new FloodError("FLOOD", request, 420),
      new InvalidDCError("ERROR_SEE_OTHER", request, 303),
      new EmailUnconfirmedError({ capture: 6, request }),
      new Error("FILE_REFERENCE_EXPIRED_BUT_NOT_ALLOW_LISTED"),
    ];

    for (const cause of cases) {
      expect(classify(cause).summary.category).toBe("unknown");
    }
  });

  test("emits a deterministic safe summary without cause or unsafe context", () => {
    const secrets = [
      "session-value",
      "access-hash-9988",
      "file-reference-aabb",
      "private-message-text",
      "holiday-photo.jpg",
      "https://signed.example/object?signature=secret",
    ];
    const cause = new Error(secrets.join(" "));
    const failure = classifyTelegramError(cause, {
      attempt: -1,
      observedAt: context.observedAt,
      operation: "fileDownload",
      peer: { id: "unsafe-user-name", kind: "user" },
      requestConstructor: "upload.GetFile session-value",
    });
    const serializedFailure = JSON.stringify(failure);

    expect(Redacted.value(failure.cause)).toBe(cause);
    expect(JSON.stringify(failure.cause)).toBe(
      '"<redacted:TelegramErrorCause>"'
    );
    expect(failure.summary).toEqual({
      category: "unknown",
      message: "The Telegram operation failed for an unclassified reason.",
      observedAt: context.observedAt,
      operation: "fileDownload",
    });
    for (const secret of secrets) {
      expect(serializedFailure).not.toContain(secret);
    }
  });
});
