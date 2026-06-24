import {
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@remnant/ui/components/sidebar";
import Link from "next/link";
import type { TrackedDialog } from "../../types";
import { dialogHandle } from "../../utils";

interface TrackedDialogItemProps {
  dialog: TrackedDialog;
  isActive: boolean;
}

export function TrackedDialogItem({
  dialog,
  isActive,
}: TrackedDialogItemProps) {
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        isActive={isActive}
        render={
          <Link
            href={{
              pathname: "/dashboard/dialogs/all",
              query: { dialogId: dialog.dialogId },
            }}
          >
            <span className="truncate">{dialog.name}</span>
            <span className="sr-only">{dialogHandle(dialog)}</span>
          </Link>
        }
      />
    </SidebarMenuSubItem>
  );
}
