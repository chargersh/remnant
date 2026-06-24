"use client";

import { api } from "@remnant/backend/convex/_generated/api";
import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@remnant/ui/components/sidebar";
import { useQuery } from "convex/react";
import { type ComponentProps, useEffect, useState } from "react";
import { AccountSwitcher } from "./components/account-switcher/account-switcher";
import { NavUser } from "./components/nav-user/nav-user";
import { SidebarNavigation } from "./components/navigation/sidebar-navigation";

const user = {
  name: "shadcn",
  email: "m@example.com",
  avatar: "/avatars/shadcn.jpg",
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const accounts = useQuery(api.telegramAccounts.list);
  const [selectedAccountId, setSelectedAccountId] =
    useState<Id<"telegramAccounts">>();

  useEffect(() => {
    const firstAccount = accounts?.[0];

    if (selectedAccountId || !firstAccount) {
      return;
    }

    setSelectedAccountId(firstAccount.accountId);
  }, [accounts, selectedAccountId]);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <AccountSwitcher
          accounts={accounts}
          onSelectedAccountIdChange={setSelectedAccountId}
          selectedAccountId={selectedAccountId}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarNavigation
          accountId={selectedAccountId}
          isAccountLoading={accounts === undefined}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
