import bigInt from "big-integer";
import { Data, Effect, Predicate } from "effect";

const DEFAULT_MAX_DEPTH = 64;
const DEFAULT_MAX_NODES = 100_000;

export const TELEGRAM_RAW_FORMAT_VERSION = 1 as const;

export interface TelegramRawEncodingOptions {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

export type TelegramRawValue =
  | boolean
  | null
  | number
  | string
  | readonly TelegramRawValue[]
  | {
      readonly $type: "bytes";
      readonly base64: string;
    }
  | {
      readonly $type: "long";
      readonly value: string;
    }
  | {
      readonly $type: "object";
      readonly fields: Readonly<Record<string, TelegramRawValue>>;
    }
  | {
      readonly $type: "telegramConstructor";
      readonly constructor: string;
      readonly fields: Readonly<Record<string, TelegramRawValue>>;
    }
  | {
      readonly $type: "undefined";
    };

export class TelegramRawEncodingError extends Data.TaggedError(
  "TelegramRawEncodingError"
)<{
  readonly path: string;
  readonly reason: string;
}> {}

interface TlObject {
  readonly className: string;
  readonly originalArgs: Record<string, unknown>;
}

const isTlObject = (value: unknown): value is TlObject =>
  Predicate.isObject(value) &&
  typeof value.className === "string" &&
  Predicate.isObject(value.originalArgs);

const bytesToBase64 = (value: Uint8Array) =>
  Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString(
    "base64"
  );

const childPath = (path: string, key: string | number) =>
  typeof key === "number" ? `${path}[${key}]` : `${path}.${key}`;

const NOT_ENCODED = Symbol("TelegramRaw.notEncoded");

class TelegramRawEncoder {
  readonly #ancestors = new WeakSet<object>();
  readonly #maxDepth: number;
  readonly #maxNodes: number;
  #nodes = 0;

  constructor(options: TelegramRawEncodingOptions) {
    this.#maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.#maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  }

  encode(current: unknown, path = "$", depth = 0): TelegramRawValue {
    this.#countNode(path);
    this.#checkDepth(path, depth);

    const knownValue = this.#encodeKnownValue(current, path);
    if (knownValue !== NOT_ENCODED) {
      return knownValue;
    }

    if (typeof current !== "object" || current === null) {
      throw this.#error(
        path,
        `Unsupported JavaScript value: ${typeof current}`
      );
    }

    return this.#encodeObject(current, path, depth);
  }

  #checkDepth(path: string, depth: number) {
    if (depth > this.#maxDepth) {
      throw this.#error(
        path,
        `Value exceeds the ${this.#maxDepth} level depth limit`
      );
    }
  }

  #countNode(path: string) {
    this.#nodes += 1;

    if (this.#nodes > this.#maxNodes) {
      throw this.#error(path, `Value exceeds the ${this.#maxNodes} node limit`);
    }
  }

  #encodeKnownValue(
    current: unknown,
    path: string
  ): TelegramRawValue | typeof NOT_ENCODED {
    if (current === undefined) {
      return { $type: "undefined" };
    }

    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "string"
    ) {
      return current;
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw this.#error(path, "Non-finite numbers are not supported");
      }

      return Object.is(current, -0) ? 0 : current;
    }

    if (typeof current === "bigint" || bigInt.isInstance(current)) {
      return { $type: "long", value: current.toString(10) };
    }

    return current instanceof Uint8Array
      ? { $type: "bytes", base64: bytesToBase64(current) }
      : NOT_ENCODED;
  }

  #encodeObject(
    current: object,
    path: string,
    depth: number
  ): TelegramRawValue {
    if (this.#ancestors.has(current)) {
      throw this.#error(path, "Circular reference detected");
    }

    this.#ancestors.add(current);

    try {
      return Array.isArray(current)
        ? current.map((item, index) =>
            this.encode(item, childPath(path, index), depth + 1)
          )
        : this.#encodeRecord(current, path, depth);
    } finally {
      this.#ancestors.delete(current);
    }
  }

  #encodeRecord(
    current: object,
    path: string,
    depth: number
  ): TelegramRawValue {
    const source = isTlObject(current)
      ? current.originalArgs
      : (current as Record<string, unknown>);
    const encoded = Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [
          key,
          this.encode(source[key], childPath(path, key), depth + 1),
        ])
    ) as Record<string, TelegramRawValue>;

    if (isTlObject(current)) {
      return {
        $type: "telegramConstructor",
        constructor: current.className,
        fields: encoded,
      };
    }

    return { $type: "object", fields: encoded };
  }

  #error(path: string, reason: string) {
    return new TelegramRawEncodingError({ path, reason });
  }
}

export const encodeTelegramRawValue = Effect.fn("TelegramRaw.encode")(
  (value: unknown, options: TelegramRawEncodingOptions = {}) =>
    Effect.try({
      try: () => new TelegramRawEncoder(options).encode(value),
      catch: (cause) =>
        cause instanceof TelegramRawEncodingError
          ? cause
          : new TelegramRawEncodingError({
              path: "$",
              reason:
                cause instanceof Error
                  ? cause.message
                  : "Unknown raw encoding error",
            }),
    })
);
