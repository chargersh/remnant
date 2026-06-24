import type { SidebarUser } from "../../types";

interface UserSummaryProps {
  user: SidebarUser;
}

export function UserSummary({ user }: UserSummaryProps) {
  return (
    <div className="grid flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">{user.name}</span>
      <span className="truncate text-xs">{user.email}</span>
    </div>
  );
}
