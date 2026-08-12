"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@remnant/ui/components/sidebar";
import { type ComponentProps, Suspense } from "react";
import { useSelectedAccount } from "@/features/accounts/selected-account-context";
import { SidebarNavigation } from "./components/navigation/sidebar-navigation";
import { UserMenu } from "./components/sidebar-footer/user-menu";
import { AccountMenu } from "./components/sidebar-header/account-menu";
import { accountHandle } from "./utils";

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const {
    accounts,
    isAccountLoading,
    selectAccount,
    selectedAccount,
    selectedAccountId,
  } = useSelectedAccount();
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
          onSelectedAccountIdChange={selectAccount}
          selectedAccountId={selectedAccountId}
        />
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={null}>
          <SidebarNavigation
            accountId={selectedAccountId}
            isAccountLoading={isAccountLoading}
          />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
