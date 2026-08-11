"use client";

import { api } from "@remnant/backend/convex/_generated/api";
import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@remnant/ui/components/sidebar";
import { useQuery } from "convex/react";
import {
  type ComponentProps,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SidebarNavigation } from "./components/navigation/sidebar-navigation";
import { UserMenu } from "./components/sidebar-footer/user-menu";
import { AccountMenu } from "./components/sidebar-header/account-menu";
import { accountHandle } from "./utils";

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const accounts = useQuery(api.telegramAccounts.list);
  const [selectedAccountId, setSelectedAccountId] =
    useState<Id<"telegramAccounts">>();

  useEffect(() => {
    if (accounts === undefined) {
      return;
    }

    const firstAccount = accounts?.[0];

    if (!firstAccount) {
      if (selectedAccountId) {
        setSelectedAccountId(undefined);
      }
      return;
    }

    if (
      !(
        selectedAccountId &&
        accounts.some((account) => account.accountId === selectedAccountId)
      )
    ) {
      setSelectedAccountId(firstAccount.accountId);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = useMemo(
    () =>
      accounts?.find((account) => account.accountId === selectedAccountId) ??
      accounts?.[0],
    [accounts, selectedAccountId]
  );
  const user = selectedAccount
    ? {
        email: accountHandle(selectedAccount),
        name: selectedAccount.displayName,
      }
    : {
        email: "No Telegram account selected",
        name: accounts === undefined ? "Loading account" : "No account",
      };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <AccountMenu
          accounts={accounts}
          onSelectedAccountIdChange={setSelectedAccountId}
          selectedAccountId={selectedAccountId}
        />
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={null}>
          <SidebarNavigation
            accountId={selectedAccountId}
            isAccountLoading={accounts === undefined}
          />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
