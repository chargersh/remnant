import type { api } from "@remnant/backend/convex/_generated/api";
import type { useQuery } from "convex/react";

export type TelegramAccount = NonNullable<
  ReturnType<typeof useQuery<typeof api.telegramAccounts.list>>
>[number];
