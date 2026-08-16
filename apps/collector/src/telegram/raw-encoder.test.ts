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

    const exit = await Effect.runPromiseExit(encodeTelegramRawValue(source));

    expect(exit._tag).toBe("Failure");
  });
});
