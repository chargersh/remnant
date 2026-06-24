import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@remnant/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@remnant/ui/components/sidebar";
import { useMemo } from "react";
import type { TelegramAccount } from "../../types";
import { AccountMenuItem } from "./account-menu-item";
import { AccountTriggerContent } from "./account-trigger-content";

interface AccountSwitcherProps {
  accounts: TelegramAccount[] | undefined;
  onSelectedAccountIdChange: (accountId: Id<"telegramAccounts">) => void;
  selectedAccountId: Id<"telegramAccounts"> | undefined;
}

export function AccountSwitcher({
  accounts,
  onSelectedAccountIdChange,
  selectedAccountId,
}: AccountSwitcherProps) {
  const { isMobile } = useSidebar();
  const activeAccount = useMemo(
    () =>
      accounts?.find((account) => account.accountId === selectedAccountId) ??
      accounts?.[0],
    [accounts, selectedAccountId]
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={!accounts?.length}
            render={
              <SidebarMenuButton
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                size="lg"
              />
            }
          >
            <AccountTriggerContent
              account={activeAccount}
              isLoading={accounts === undefined}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-fit"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Telegram accounts
              </DropdownMenuLabel>
              {accounts?.map((account) => (
                <AccountMenuItem
                  account={account}
                  key={account.accountId}
                  onSelect={onSelectedAccountIdChange}
                />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
