import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@remnant/ui/components/sidebar";
import Link from "next/link";
import type { SidebarLinkNavigationItem } from "./navigation-config";

interface NavigationItemProps {
  isActive: boolean;
  item: SidebarLinkNavigationItem;
}

export function NavigationItem({ isActive, item }: NavigationItemProps) {
  const Icon = item.icon;

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
