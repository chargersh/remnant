import { Avatar, AvatarFallback } from "@remnant/ui/components/avatar";
import { Badge } from "@remnant/ui/components/badge";
import {
  ArchiveIcon,
  BookmarkIcon,
  BotIcon,
  CheckCircle2Icon,
  CircleSlash2Icon,
  InboxIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  PinIcon,
  RefreshCwOffIcon,
  UserRoundIcon,
} from "lucide-react";
import type { DialogListItem } from "../types";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export function DialogIdentity({ dialog }: { dialog: DialogListItem }) {
  const handle = dialog.username
    ? `@${dialog.username}`
    : `Telegram ID ${dialog.telegramDialogId}`;
  const initial = dialog.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex min-w-56 items-center gap-3">
      <Avatar size="lg">
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <span className="grid gap-1 leading-none">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="max-w-72 truncate">{dialog.name}</span>
          {dialog.pinned ? (
            <PinIcon
              aria-label="Pinned in Telegram"
              className="size-3 text-muted-foreground"
            />
          ) : null}
        </span>
        <span className="text-muted-foreground text-xs">{handle}</span>
      </span>
    </div>
  );
}

export function DialogType({ dialog }: { dialog: DialogListItem }) {
  let Icon = UserRoundIcon;
  let iconClassName = "text-sky-600 dark:text-sky-400";
  let label = "Person";

  if (dialog.isSelf) {
    Icon = BookmarkIcon;
    iconClassName = "text-muted-foreground";
    label = "Saved";
  } else if (dialog.isBot) {
    Icon = BotIcon;
    iconClassName = "text-emerald-600 dark:text-emerald-400";
    label = "Bot";
  } else if (dialog.type === "group") {
    Icon = MessagesSquareIcon;
    iconClassName = "text-violet-600 dark:text-violet-400";
    label = "Group";
  } else if (dialog.type === "channel") {
    Icon = MegaphoneIcon;
    iconClassName = "text-amber-600 dark:text-amber-400";
    label = "Channel";
  }

  return (
    <Badge className="bg-muted/50" variant="outline">
      <Icon className={iconClassName} data-icon="inline-start" />
      {label}
    </Badge>
  );
}

export function DialogLocation({ dialog }: { dialog: DialogListItem }) {
  if (dialog.archived) {
    return (
      <Badge variant="secondary">
        <ArchiveIcon
          className="text-muted-foreground"
          data-icon="inline-start"
        />
        Archive
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      <InboxIcon className="text-muted-foreground" data-icon="inline-start" />
      Main
    </Badge>
  );
}

export function DialogAvailability({ dialog }: { dialog: DialogListItem }) {
  if (dialog.isDeleted) {
    return (
      <Badge
        className="bg-destructive/10 text-foreground dark:bg-destructive/15"
        variant="secondary"
      >
        <CircleSlash2Icon
          className="text-destructive"
          data-icon="inline-start"
        />
        Deleted
      </Badge>
    );
  }

  if (dialog.availability === "forbidden") {
    return (
      <Badge
        className="bg-destructive/10 text-foreground dark:bg-destructive/15"
        variant="secondary"
      >
        <CircleSlash2Icon
          className="text-destructive"
          data-icon="inline-start"
        />
        Unavailable
      </Badge>
    );
  }

  return (
    <Badge
      className="bg-emerald-500/10 text-foreground dark:bg-emerald-500/15"
      variant="secondary"
    >
      <CheckCircle2Icon
        className="text-emerald-600 dark:text-emerald-400"
        data-icon="inline-start"
      />
      Available
    </Badge>
  );
}

export function DialogSyncStatus({ dialog }: { dialog: DialogListItem }) {
  if (dialog.sourceStatus === "active") {
    return (
      <Badge variant="outline">
        <CheckCircle2Icon
          className="text-muted-foreground"
          data-icon="inline-start"
        />
        Current
      </Badge>
    );
  }

  return (
    <div className="grid gap-1">
      <Badge
        className="bg-amber-500/10 text-foreground dark:bg-amber-500/15"
        variant="secondary"
      >
        <RefreshCwOffIcon
          className="text-amber-600 dark:text-amber-400"
          data-icon="inline-start"
        />
        Missing
      </Badge>
      {dialog.missingSince ? (
        <time
          className="text-muted-foreground text-xs"
          dateTime={new Date(dialog.missingSince).toISOString()}
        >
          Since {dateFormatter.format(dialog.missingSince)}
        </time>
      ) : null}
    </div>
  );
}
