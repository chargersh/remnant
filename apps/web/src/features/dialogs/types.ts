import type { api } from "@remnant/backend/convex/_generated/api";
import type { useQuery } from "convex/react";

export type DialogListItem = NonNullable<
  ReturnType<typeof useQuery<typeof api.telegramDialogs.list>>
>[number];
