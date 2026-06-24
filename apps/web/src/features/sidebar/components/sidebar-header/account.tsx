import { Spinner } from "@remnant/ui/components/spinner";
import { ChevronsUpDownIcon, UserRoundIcon } from "lucide-react";
import type { TelegramAccount } from "../../types";
import { accountHandle, accountInitial } from "../../utils";

interface AccountProps {
  account: TelegramAccount | undefined;
  isLoading: boolean;
}

export function Account({ account, isLoading }: AccountProps) {
  const showAccountInitial = !isLoading && account;
  const showEmptyIcon = !(isLoading || account);

  return (
    <>
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        {isLoading ? <Spinner className="size-4" /> : null}
        {showAccountInitial ? accountInitial(account) : null}
        {showEmptyIcon ? <UserRoundIcon className="size-4" /> : null}
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
