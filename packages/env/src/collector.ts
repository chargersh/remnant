import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    COLLECTOR_API_KEY: z.string().min(32),
    CONVEX_URL: z.url(),
    TELEGRAM_API_HASH: z.string().min(1),
    TELEGRAM_API_ID: z.coerce.number().int().positive(),
    TELEGRAM_SESSION: z.string().min(1).optional(),
  },
  runtimeEnv: {
    COLLECTOR_API_KEY: process.env.COLLECTOR_API_KEY,
    CONVEX_URL: process.env.CONVEX_URL,
    TELEGRAM_API_HASH: process.env.TELEGRAM_API_HASH,
    TELEGRAM_API_ID: process.env.TELEGRAM_API_ID,
    TELEGRAM_SESSION: process.env.TELEGRAM_SESSION,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
