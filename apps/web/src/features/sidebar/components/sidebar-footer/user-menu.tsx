import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@remnant/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@remnant/ui/components/sidebar";
import { ChevronsUpDownIcon } from "lucide-react";
import type { SidebarUser } from "../../types";
import { User } from "./user";
import { UserMenuItems } from "./user-menu-items";

interface UserMenuProps {
  user: SidebarUser;
}

export function UserMenu({ user }: UserMenuProps) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="aria-expanded:bg-muted group-data-[collapsible=icon]:rounded-full"
                size="lg"
              />
            }
          >
            <User user={user} />
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-fit"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <User user={user} />
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <UserMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
