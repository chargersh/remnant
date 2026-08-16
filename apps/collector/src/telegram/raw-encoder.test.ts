import { describe, expect, test } from "bun:test";
import bigInt from "big-integer";
import { Effect } from "effect";
import { Api } from "telegram";
import { encodeCanonicalJson } from "./canonical-json";
import { encodeTelegramRawValue } from "./raw-encoder";

describe("encodeTelegramRawValue", () => {
  test("encodes Telegram constructors, longs, bytes, and undefined", async () => {
    const source = new Api.PeerUser({ userId: bigInt("90071992547409930") });
    const encoded = await Effect.runPromise(
      encodeTelegramRawValue({
        bytes: Buffer.from([1, 2, 3]),
        missing: undefined,
        source,
      })
    );

    expect(encoded).toEqual({
      $type: "object",
      fields: {
        bytes: { $type: "bytes", base64: "AQID" },
        missing: { $type: "undefined" },
        source: {
          $type: "telegramConstructor",
          constructor: "PeerUser",
          fields: {
            userId: { $type: "long", value: "90071992547409930" },
          },
        },
      },
    });
  });

  test("canonical JSON sorts object keys recursively", async () => {
    const encoded = await Effect.runPromise(
      encodeCanonicalJson({ z: 1, a: { y: true, b: "value" } })
    );

    expect(encoded).toBe('{"a":{"b":"value","y":true},"z":1}');
  });

  test("rejects circular values with a typed error", async () => {
    const source: { self?: unknown } = {};
    source.self = source;

    const error = await Effect.runPromise(
      Effect.flip(encodeTelegramRawValue(source))
    );

    expect(error).toMatchObject({
      _tag: "TelegramRawEncodingError",
      path: "$.self",
      reason: "Circular reference detected",
    });
  });

  test("reports depth and node limit failures at their exact paths", async () => {
    const depthError = await Effect.runPromise(
      Effect.flip(encodeTelegramRawValue({ nested: {} }, { maxDepth: 0 }))
    );
    const nodeError = await Effect.runPromise(
      Effect.flip(encodeTelegramRawValue({ value: true }, { maxNodes: 1 }))
    );

    expect(depthError).toMatchObject({
      _tag: "TelegramRawEncodingError",
      path: "$.nested",
      reason: "Value exceeds the 0 level depth limit",
    });
    expect(nodeError).toMatchObject({
      _tag: "TelegramRawEncodingError",
      path: "$.value",
      reason: "Value exceeds the 1 node limit",
    });
  });

  test("rejects non-finite numbers and unsupported JavaScript values", async () => {
    const nonFiniteError = await Effect.runPromise(
      Effect.flip(encodeTelegramRawValue({ value: Number.NaN }))
    );
    const unsupportedError = await Effect.runPromise(
      Effect.flip(encodeTelegramRawValue({ value: Symbol("unsupported") }))
    );

    expect(nonFiniteError).toMatchObject({
      path: "$.value",
      reason: "Non-finite numbers are not supported",
    });
    expect(unsupportedError).toMatchObject({
      path: "$.value",
      reason: "Unsupported JavaScript value: symbol",
    });
  });

  test("normalizes negative zero and permits repeated non-circular objects", async () => {
    const shared = { value: -0 };
    const encoded = await Effect.runPromise(
      encodeTelegramRawValue({ first: shared, second: shared })
    );

    expect(encoded).toEqual({
      $type: "object",
      fields: {
        first: {
          $type: "object",
          fields: { value: 0 },
        },
        second: {
          $type: "object",
          fields: { value: 0 },
        },
      },
    });
  });
});
