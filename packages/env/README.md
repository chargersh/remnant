# @remnant/env

Typed environment validation for app runtime envs.

## Current Setup

The web app uses T3 env from `src/web.ts`.

Current required web env:

```env
NEXT_PUBLIC_CONVEX_URL=
```

The collector requires:

```env
COLLECTOR_API_KEY=
CONVEX_URL=
TELEGRAM_API_HASH=
TELEGRAM_API_ID=
TELEGRAM_SESSION=
```

Configure the same `COLLECTOR_API_KEY` value on the Convex deployment:

```bash
convex env set COLLECTOR_API_KEY <secret>
```

Keep web env files in `apps/web`:

```text
apps/web/.env.local
apps/web/.env.production
apps/web/.env.example
```

`apps/web/.env.example` should contain every required key with empty placeholder values.

## Adding Web Secrets

If the Next app needs a new env var:

1. Add it to `apps/web/.env.local`.
2. Add it to `apps/web/.env.production` or the production host env settings.
3. Add an empty placeholder to `apps/web/.env.example`.
4. Add validation to `src/web.ts`.

Use `NEXT_PUBLIC_` only for values that are safe to expose to the browser.

## Adding More Apps

If a new app is added under `apps/*`, give that app its own env files:

```text
apps/new-app/.env.local
apps/new-app/.env.production
apps/new-app/.env.example
```

Only add a new file in this package when that app reads env vars. For example, `src/admin.ts` or `src/mobile.ts`.

Each app should import only its own env module. Do not share one broad env contract across unrelated apps.

## Convex Env

Do not use T3 env for Convex backend secrets.

Convex has its own deployment-level env system. Set Convex secrets in the Convex dashboard or with the Convex CLI:

```bash
convex env set NAME value
convex env list
```

If Convex functions need required env vars, declare them in:

```text
packages/backend/convex/convex.config.ts
```

Use Convex validators there, then import the generated typed `env` object from `_generated/server` inside Convex functions.

Example:

```ts
// packages/backend/convex/convex.config.ts
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    OPENAI_API_KEY: v.string(),
    LOG_LEVEL: v.optional(
      v.union(v.literal("debug"), v.literal("info"), v.literal("error")),
    ),
  },
});

export default app;
```

```ts
// packages/backend/convex/example.ts
import { query, env } from "./_generated/server";

export const example = query({
  handler: async () => {
    return env.LOG_LEVEL ?? "info";
  },
});
```
