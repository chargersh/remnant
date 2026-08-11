import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@remnant/ui/components/avatar";
import type { SidebarUser } from "../../types";

const whitespacePattern = /\s+/;

interface UserProps {
  user: SidebarUser;
}

export function User({ user }: UserProps) {
  const initials = user.name
    .trim()
    .split(whitespacePattern)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <>
      <Avatar>
        {user.avatar ? <AvatarImage alt={user.name} src={user.avatar} /> : null}
        <AvatarFallback>{initials || "?"}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs">{user.email}</span>
      </div>
    </>
  );
}
