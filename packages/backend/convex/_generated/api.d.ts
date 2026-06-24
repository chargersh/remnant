/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as collector_dialogSync from "../collector/dialogSync.js";
import type * as functions from "../functions.js";
import type * as healthCheck from "../healthCheck.js";
import type * as validators_dialogSync from "../validators/dialogSync.js";
import type * as validators_telegram from "../validators/telegram.js";
import type * as validators_telegramAccounts from "../validators/telegramAccounts.js";
import type * as validators_telegramDialogs from "../validators/telegramDialogs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "collector/dialogSync": typeof collector_dialogSync;
  functions: typeof functions;
  healthCheck: typeof healthCheck;
  "validators/dialogSync": typeof validators_dialogSync;
  "validators/telegram": typeof validators_telegram;
  "validators/telegramAccounts": typeof validators_telegramAccounts;
  "validators/telegramDialogs": typeof validators_telegramDialogs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
