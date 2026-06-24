import { Spinner } from "@remnant/ui/components/spinner";
import { UserRoundIcon } from "lucide-react";
import type { TelegramAccount } from "../../types";
import { accountInitial } from "../../utils";

interface AccountIconProps {
  account: TelegramAccount | undefined;
  isLoading: boolean;
}

export function AccountIcon({ account, isLoading }: AccountIconProps) {
  if (isLoading) {
    return <Spinner className="size-4" />;
  }

  if (account) {
    return accountInitial(account);
  }

  return <UserRoundIcon className="size-4" />;
}
