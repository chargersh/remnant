import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@remnant/ui/components/sidebar";

interface TrackedDialogEmptyStateProps {
  message: string;
}

export function TrackedDialogEmptyState({
  message,
}: TrackedDialogEmptyStateProps) {
  return (
    <SidebarMenuSub>
      <SidebarMenuSubItem>
        <SidebarMenuSubButton>
          <span className="text-muted-foreground">{message}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    </SidebarMenuSub>
  );
}
