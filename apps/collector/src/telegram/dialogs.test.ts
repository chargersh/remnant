import { describe, expect, test } from "bun:test";
import bigInt from "big-integer";
import { Effect, Layer, Redacted } from "effect";
import type { TelegramClient as GramJsTelegramClient } from "telegram";
import { UnauthorizedError } from "telegram/errors";
import { Api } from "telegram/tl";
import { TelegramClient } from "./client";
import { getTelegramDialogs } from "./dialogs";

describe("getTelegramDialogs", () => {
  test("wraps dialog failures with classified operation context", async () => {
    const request = new Api.messages.GetDialogs({
      hash: bigInt.zero,
      limit: 100,
      offsetDate: 0,
      offsetId: 0,
      offsetPeer: new Api.InputPeerEmpty(),
    });
    const cause = new UnauthorizedError("SESSION_REVOKED", request, 401);
    const client = {
      getDialogs: () => Promise.reject(cause),
    } as unknown as GramJsTelegramClient;
    const error = await Effect.runPromise(
      getTelegramDialogs().pipe(
        Effect.flip,
        Effect.provide(Layer.succeed(TelegramClient, client))
      )
    );

    expect(error).toMatchObject({
      _tag: "TelegramDialogsFetchError",
      failure: {
        summary: {
          category: "authorizationLost",
          operation: "dialogList",
          requestConstructor: "messages.GetDialogs",
          safeCode: "SESSION_REVOKED",
        },
      },
    });
    expect(Redacted.value(error.failure.cause)).toBe(cause);
  });
});
