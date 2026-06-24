import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@remnant/ui/components/sidebar";
import { RefreshCwIcon, Rows3Icon } from "lucide-react";
import Link from "next/link";
import type { archiveNavigationItems } from "../../utils";

type ArchiveNavigationItem = (typeof archiveNavigationItems)[number];

interface NavigationItemProps {
  isActive: boolean;
  item: ArchiveNavigationItem;
}

const navigationIcons = {
  "all-dialogs": Rows3Icon,
  sync: RefreshCwIcon,
} satisfies Record<ArchiveNavigationItem["value"], typeof Rows3Icon>;

export function NavigationItem({ isActive, item }: NavigationItemProps) {
  const Icon = navigationIcons[item.value];

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        render={
          <Link href={item.href}>
            <Icon />
            <span>{item.label}</span>
          </Link>
        }
      />
    </SidebarMenuItem>
  );
}
