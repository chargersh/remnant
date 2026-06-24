"use client";

import { api } from "@remnant/backend/convex/_generated/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@remnant/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@remnant/ui/components/sidebar";
import { Spinner } from "@remnant/ui/components/spinner";
import { useQuery } from "convex/react";
import { ChevronsUpDownIcon, UserRoundIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TelegramAccount = NonNullable<
  ReturnType<typeof useQuery<typeof api.telegramAccounts.list>>
>[number];

const accountHandle = (account: TelegramAccount) =>
  account.username ? `@${account.username}` : account.telegramAccountId;

const accountInitial = (account: TelegramAccount) =>
  account.displayName.trim().charAt(0).toUpperCase() || "?";

function AccountIcon({
  account,
  isLoading,
}: {
  account: TelegramAccount | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Spinner className="size-4" />;
  }

  if (account) {
    return accountInitial(account);
  }

  return <UserRoundIcon className="size-4" />;
}

export function AccountSwitcher() {
  const { isMobile } = useSidebar();
  const accounts = useQuery(api.telegramAccounts.list);
  const [activeAccountId, setActiveAccountId] = useState<string>();
  const activeAccount = useMemo(
    () =>
      accounts?.find((account) => account.accountId === activeAccountId) ??
      accounts?.[0],
    [accounts, activeAccountId]
  );

  useEffect(() => {
    const firstAccount = accounts?.[0];

    if (activeAccountId || !firstAccount) {
      return;
    }

    setActiveAccountId(firstAccount.accountId);
  }, [accounts, activeAccountId]);

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
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <AccountIcon
                account={activeAccount}
                isLoading={accounts === undefined}
              />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {activeAccount?.displayName ??
                  (accounts === undefined ? "Loading accounts" : "No accounts")}
              </span>
              <span className="truncate text-xs">
                {activeAccount ? accountHandle(activeAccount) : "Telegram"}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
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
                <DropdownMenuItem
                  className="gap-2 p-2"
                  key={account.accountId}
                  onClick={() => setActiveAccountId(account.accountId)}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    {accountInitial(account)}
                  </div>
                  <div className="grid leading-tight">
                    <span>{account.displayName}</span>
                    <span className="text-muted-foreground text-xs">
                      {accountHandle(account)}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
