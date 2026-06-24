import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@remnant/ui/components/avatar";
import type { SidebarUser } from "../../types";

interface UserProps {
  user: SidebarUser;
}

export function User({ user }: UserProps) {
  return (
    <>
      <Avatar>
        <AvatarImage alt={user.name} src={user.avatar} />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs">{user.email}</span>
      </div>
    </>
  );
}
