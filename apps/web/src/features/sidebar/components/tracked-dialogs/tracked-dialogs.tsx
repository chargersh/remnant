import { api } from "@remnant/backend/convex/_generated/api";
import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@remnant/ui/components/collapsible";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@remnant/ui/components/sidebar";
import { useQuery } from "convex/react";
import { ChevronRightIcon, ListChecksIcon } from "lucide-react";
import { TrackedDialogEmptyState } from "./tracked-dialog-empty-state";
import { TrackedDialogItem } from "./tracked-dialog-item";

interface TrackedDialogsProps {
  accountId: Id<"telegramAccounts"> | undefined;
  activeDialogId: string | null;
  isAccountLoading: boolean;
}

export function TrackedDialogs({
  accountId,
  activeDialogId,
  isAccountLoading,
}: TrackedDialogsProps) {
  const dialogs = useQuery(
    api.telegramDialogs.listTracked,
    accountId ? { accountId } : "skip"
  );
  const hasAccount = accountId !== undefined;
  const hasTrackedDialogs = dialogs !== undefined && dialogs.length > 0;
  const showNoAccount = !(isAccountLoading || hasAccount);
  const showNoTrackedDialogs =
    !(isAccountLoading || !hasAccount || dialogs === undefined) &&
    dialogs.length === 0;

  return (
    <Collapsible className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger
          render={<SidebarMenuButton isActive={activeDialogId !== null} />}
        >
          <ListChecksIcon />
          <span>Tracked dialogs</span>
          <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          {showNoAccount ? (
            <TrackedDialogEmptyState message="No account selected" />
          ) : null}
          {showNoTrackedDialogs ? (
            <TrackedDialogEmptyState message="No tracked dialogs" />
          ) : null}
          {hasTrackedDialogs ? (
            <SidebarMenuSub>
              {dialogs.map((dialog) => (
                <TrackedDialogItem
                  dialog={dialog}
                  isActive={activeDialogId === dialog.dialogId}
                  key={dialog.dialogId}
                />
              ))}
            </SidebarMenuSub>
          ) : null}
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
