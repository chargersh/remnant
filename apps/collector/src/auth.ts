import { BunRuntime, BunServices } from "@effect/platform-bun";
import { env } from "@remnant/env/collector";
import { Console, Data, Effect, Redacted } from "effect";
import { Command, Prompt } from "effect/unstable/cli";
import { StringSession } from "telegram/sessions";
import packageJson from "../package.json";
import { makeTelegramClientResource } from "./telegram/client";

const E164_PHONE_NUMBER = /^\+[1-9]\d{6,14}$/;

export class TelegramAuthenticationError extends Data.TaggedError(
  "TelegramAuthenticationError"
)<{
  readonly cause: unknown;
}> {}

export class TelegramSessionSerializationError extends Data.TaggedError(
  "TelegramSessionSerializationError"
)<{
  readonly cause: unknown;
}> {}

const phoneNumberPrompt = Prompt.text({
  message:
    "Telegram phone number (international format, e.g. +393331234567; no spaces or dashes)",
  validate: (value) => {
    const normalized = value.trim();

    return E164_PHONE_NUMBER.test(normalized)
      ? Effect.succeed(normalized)
      : Effect.fail(
          "Use + followed by the country code and number, with no spaces or dashes"
        );
  },
});

const requiredPassword = (message: string) =>
  Prompt.password({
    message,
    validate: (value) =>
      value.length === 0
        ? Effect.fail("A value is required")
        : Effect.succeed(value),
  });

const authenticate = Effect.fn("TelegramAuth.authenticate")(function* () {
  const promptContext = yield* Effect.context<Prompt.Environment>();
  const runWithPromptContext = Effect.runPromiseWith(promptContext);
  const runPrompt = <A>(prompt: Prompt.Prompt<A>) =>
    runWithPromptContext(prompt);

  const stringSession = new StringSession("");
  const client = yield* makeTelegramClientResource({
    apiHash: env.TELEGRAM_API_HASH,
    apiId: env.TELEGRAM_API_ID,
    session: stringSession,
  });

  yield* Effect.tryPromise({
    try: () =>
      client.start({
        phoneNumber: () => runPrompt(phoneNumberPrompt),
        phoneCode: () =>
          runPrompt(requiredPassword("Telegram login code")).then(
            Redacted.value
          ),
        password: (hint) =>
          runPrompt(
            requiredPassword(
              hint ? `Telegram 2FA password (${hint})` : "Telegram 2FA password"
            )
          ).then(Redacted.value),
        onError: async (error) => {
          await runWithPromptContext(
            Console.error(`Telegram rejected the input: ${error.message}`)
          );
          return false;
        },
      }),
    catch: (cause) => new TelegramAuthenticationError({ cause }),
  });

  const isAuthorized = yield* Effect.tryPromise({
    try: () => client.checkAuthorization(),
    catch: (cause) => new TelegramAuthenticationError({ cause }),
  });

  if (!isAuthorized) {
    return yield* new TelegramAuthenticationError({
      cause: "Telegram authentication completed without an authorized session.",
    });
  }

  const session = yield* Effect.try({
    try: () => stringSession.save(),
    catch: (cause) => new TelegramSessionSerializationError({ cause }),
  });

  if (session.length === 0) {
    return yield* new TelegramSessionSerializationError({
      cause: "GramJS returned an empty serialized session.",
    });
  }

  const redactedSession = Redacted.make(session);

  yield* Console.log("");
  yield* Console.log("Telegram authentication succeeded.");
  yield* Console.log(
    "Copy this value into apps/collector/.env.local for development or Railway's sealed variables for production:"
  );
  yield* Console.log("");
  yield* Console.log(`TELEGRAM_SESSION=${Redacted.value(redactedSession)}`);
  yield* Console.log("");
  yield* Console.log(
    "Treat this value like a password. It grants access to your Telegram account."
  );
});

const authCommand = Command.make("auth", {}, () => authenticate()).pipe(
  Command.withDescription(
    "Authenticate a Telegram account and generate a serialized GramJS session."
  )
);

Command.run(authCommand, { version: packageJson.version }).pipe(
  Effect.scoped,
  Effect.provide(BunServices.layer),
  BunRuntime.runMain
);
