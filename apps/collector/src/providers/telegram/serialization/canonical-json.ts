import { Data, Effect } from "effect";

export type CanonicalJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export class CanonicalJsonEncodingError extends Data.TaggedError(
  "CanonicalJsonEncodingError"
)<{
  readonly reason: string;
}> {}

const encodeNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    throw new Error("Canonical JSON does not support non-finite numbers");
  }

  return Object.is(value, -0) ? "0" : JSON.stringify(value);
};

const encodeValue = (value: CanonicalJsonValue): string => {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return encodeNumber(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(encodeValue).join(",")}]`;
  }

  const record = value as { readonly [key: string]: CanonicalJsonValue };

  const encodeProperty = (key: string) => {
    const property = record[key];

    if (property === undefined) {
      throw new Error(`Canonical JSON property ${key} is undefined`);
    }

    return `${JSON.stringify(key)}:${encodeValue(property)}`;
  };

  return `{${Object.keys(record).sort().map(encodeProperty).join(",")}}`;
};

export const encodeCanonicalJson = Effect.fn("CanonicalJson.encode")(
  (value: CanonicalJsonValue) =>
    Effect.try({
      try: () => encodeValue(value),
      catch: (cause) =>
        new CanonicalJsonEncodingError({
          reason:
            cause instanceof Error ? cause.message : "Unknown encoding error",
        }),
    })
);
