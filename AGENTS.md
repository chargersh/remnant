# AGENTS.md

## Project Overview

Remnant is a TypeScript monorepo for a Telegram archive app. The product goal is to let a user select Telegram people, channels, and groups, then preserve messages and media even if they are later deleted from Telegram.

Current stack:

- Bun workspace with Turborepo.
- Next.js app in `apps/web`.
- Convex backend package in `packages/backend`.
- Shared UI primitives in `packages/ui`.
- Shared environment/config packages in `packages/env` and `packages/config`.
- GramJS for Telegram user MTProto access. Docs are available at `https://gram.js.org/`.
- Effect v4 for non-Convex backend and collector code.

## Commands

- Install dependencies: `bun install`
- Add packages: `bun add <package>`. Remove packages: `bun remove <package>`. Do not use `npm`, `pnpm`, or `yarn`.
- Check changed code: `bun run check`
- Fix lint/format issues: `bun run lint:fix`
- Do not run `bun run dev`, `bun run build`, or `bun run start` unless the user asks. Assume the dev server is already running.
- After implementing a change, run `bun run check` as the default feedback loop. Do not run separate typecheck or lint commands unless there is a specific reason.

## Package-Managed and Generated Files

- Do not manually edit `package.json` files or `bun.lock`.
- Manage `package.json` with Bun commands (`bun add`, `bun remove`, `bun install`, or `bun pm pkg`) from the appropriate workspace.
- Do not manually edit Convex generated files under `packages/backend/convex/_generated`.
- Assume the running Convex dev server keeps generated files current. If stale or missing Convex generated files cause errors or block validation, regenerate them from `packages/backend` with `bunx convex dev --once`.
- Do not edit generated/cache directories such as `.next` or `.turbo`; let their owning tools regenerate them.
- Prefer the owning tool's documented command whenever a file is generated or package-managed. Do not patch generated output to work around stale caches.

## Code Style

- Keep strict types; do not use `any`.
- Follow existing Biome/Ultracite formatting.
- Prefer small modules with explicit boundaries over large mixed utility files.
- Use shared UI components from `@remnant/ui` when building app UI.
- Do not create unrelated refactors while implementing a focused change.

## Effect v4 Guidance

- Use Effect v4 as much as practical for non-Convex backend and collector code.
- Do not use Effect inside Convex functions; Convex has its own runtime constraints and Effect is not supported there.
- Write Effect code in current v4 style. Favor clear boundaries, explicit dependency wiring, typed errors, generators, Effect functions, structured resource lifecycles, retries, observable long-running worker behavior, etc. where they fit the problem.
- Local Effect v4 reference source is available at `/Users/apalon1/desktop/effect-v4`. Use it freely when implementing or reviewing Effect code, especially when the current codebase does not already show the pattern. Search the local Effect source/docs first to understand current v4 APIs and conventions before guessing.
