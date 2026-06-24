import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@remnant/ui/components/avatar";
import type { SidebarUser } from "../../types";

interface UserAvatarProps {
  user: SidebarUser;
}

export function UserAvatar({ user }: UserAvatarProps) {
  return (
    <Avatar>
      <AvatarImage alt={user.name} src={user.avatar} />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  );
}
