import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@remnant/ui/components/sidebar";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment } from "react";
import { workspaceNavigationItems } from "./navigation-config";
import { NavigationItem } from "./navigation-item";

interface SidebarNavigationProps {
  accountId: Id<"telegramAccounts"> | undefined;
  isAccountLoading: boolean;
}

export function SidebarNavigation({
  accountId,
  isAccountLoading,
}: SidebarNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeDialogId = searchParams.get("dialogId");
  const navigationState = {
    accountId,
    activeDialogId,
    isAccountLoading,
    pathname,
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspace</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {workspaceNavigationItems.map((item) =>
          item.type === "link" ? (
            <NavigationItem
              isActive={item.isActive(navigationState)}
              item={item}
              key={item.value}
            />
          ) : (
            <Fragment key={item.value}>{item.render(navigationState)}</Fragment>
          )
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
