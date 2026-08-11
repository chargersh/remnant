import type { api } from "@remnant/backend/convex/_generated/api";
import type { useQuery } from "convex/react";

export type { TelegramAccount } from "@/features/accounts/types";

export type TrackedDialog = NonNullable<
  ReturnType<typeof useQuery<typeof api.telegramDialogs.listTracked>>
>[number];

export interface SidebarUser {
  avatar?: string;
  email: string;
  name: string;
}
