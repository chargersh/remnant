import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@remnant/ui/components/sidebar";
import { usePathname, useSearchParams } from "next/navigation";
import { archiveNavigationItems } from "../../utils";
import { TrackedDialogs } from "../tracked-dialogs/tracked-dialogs";
import { NavigationItem } from "./navigation-item";

interface SidebarNavigationProps {
  accountId: Id<"telegramAccounts"> | undefined;
  isAccountLoading: boolean;
}

const isNavigationItemActive = ({
  activeDialogId,
  pathname,
  value,
}: {
  activeDialogId: string | null;
  pathname: string;
  value: (typeof archiveNavigationItems)[number]["value"];
}) => {
  if (value === "all-dialogs") {
    return pathname === "/dashboard/dialogs/all" && !activeDialogId;
  }

  return pathname === "/dashboard/sync";
};

export function SidebarNavigation({
  accountId,
  isAccountLoading,
}: SidebarNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeDialogId = searchParams.get("dialogId");

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Archive</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {archiveNavigationItems.map((item) => (
          <NavigationItem
            isActive={isNavigationItemActive({
              activeDialogId,
              pathname,
              value: item.value,
            })}
            item={item}
            key={item.value}
          />
        ))}
        <TrackedDialogs
          accountId={accountId}
          activeDialogId={activeDialogId}
          isAccountLoading={isAccountLoading}
        />
      </SidebarMenu>
    </SidebarGroup>
  );
}
