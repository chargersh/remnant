import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import { type LucideIcon, RefreshCwIcon, Rows3Icon } from "lucide-react";
import type { Route } from "next";
import type { ReactNode } from "react";
import { TrackedDialogs } from "../tracked-dialogs/tracked-dialogs";

export interface SidebarNavigationState {
  accountId: Id<"telegramAccounts"> | undefined;
  activeDialogId: string | null;
  isAccountLoading: boolean;
  pathname: string;
}

export interface SidebarLinkNavigationItem {
  href: Route;
  icon: LucideIcon;
  isActive: (state: SidebarNavigationState) => boolean;
  label: string;
  type: "link";
  value: string;
}

export interface SidebarCustomNavigationItem {
  render: (state: SidebarNavigationState) => ReactNode;
  type: "custom";
  value: string;
}

export type SidebarNavigationItem =
  | SidebarCustomNavigationItem
  | SidebarLinkNavigationItem;

export const workspaceNavigationItems = [
  {
    href: "/dashboard/dialogs/all",
    icon: Rows3Icon,
    isActive: ({ activeDialogId, pathname }) =>
      pathname === "/dashboard/dialogs/all" && !activeDialogId,
    label: "All dialogs",
    type: "link",
    value: "all-dialogs",
  },
  {
    href: "/dashboard/sync",
    icon: RefreshCwIcon,
    isActive: ({ pathname }) => pathname === "/dashboard/sync",
    label: "Sync",
    type: "link",
    value: "sync",
  },
  {
    render: ({ accountId, activeDialogId, isAccountLoading }) => (
      <TrackedDialogs
        accountId={accountId}
        activeDialogId={activeDialogId}
        isAccountLoading={isAccountLoading}
      />
    ),
    type: "custom",
    value: "tracked-dialogs",
  },
] satisfies readonly SidebarNavigationItem[];
