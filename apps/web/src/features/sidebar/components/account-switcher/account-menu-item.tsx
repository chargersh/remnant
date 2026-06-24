import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import { DropdownMenuItem } from "@remnant/ui/components/dropdown-menu";
import type { TelegramAccount } from "../../types";
import { accountHandle, accountInitial } from "../../utils";

interface AccountMenuItemProps {
  account: TelegramAccount;
  onSelect: (accountId: Id<"telegramAccounts">) => void;
}

export function AccountMenuItem({ account, onSelect }: AccountMenuItemProps) {
  return (
    <DropdownMenuItem
      className="gap-2 p-2"
      key={account.accountId}
      onClick={() => onSelect(account.accountId)}
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
  );
}
