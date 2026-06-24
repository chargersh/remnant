import { ChevronsUpDownIcon } from "lucide-react";
import type { TelegramAccount } from "../../types";
import { accountHandle } from "../../utils";
import { AccountIcon } from "./account-icon";

interface AccountTriggerContentProps {
  account: TelegramAccount | undefined;
  isLoading: boolean;
}

export function AccountTriggerContent({
  account,
  isLoading,
}: AccountTriggerContentProps) {
  return (
    <>
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <AccountIcon account={account} isLoading={isLoading} />
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">
          {account?.displayName ??
            (isLoading ? "Loading accounts" : "No accounts")}
        </span>
        <span className="truncate text-xs">
          {account ? accountHandle(account) : "Telegram"}
        </span>
      </div>
      <ChevronsUpDownIcon className="ml-auto" />
    </>
  );
}
