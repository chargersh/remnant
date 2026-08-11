import { Button } from "@remnant/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@remnant/ui/components/dropdown-menu";
import { Input } from "@remnant/ui/components/input";
import {
  BookmarkIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ListFilterIcon,
  LockKeyholeIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  SearchIcon,
  UserRoundIcon,
  UserRoundXIcon,
} from "lucide-react";
import type {
  DialogAvailabilityFilter,
  DialogTypeFilter,
} from "../dialog-classification";

const dialogTypeOptions = [
  {
    icon: BookmarkIcon,
    iconClassName: "text-muted-foreground",
    label: "Saved",
    value: "saved",
  },
  {
    icon: UserRoundIcon,
    iconClassName: "text-sky-600 dark:text-sky-400",
    label: "Person",
    value: "person",
  },
  {
    icon: BotIcon,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    label: "Bot",
    value: "bot",
  },
  {
    icon: MessagesSquareIcon,
    iconClassName: "text-violet-600 dark:text-violet-400",
    label: "Group",
    value: "group",
  },
  {
    icon: MegaphoneIcon,
    iconClassName: "text-amber-600 dark:text-amber-400",
    label: "Channel",
    value: "channel",
  },
] as const;

const dialogAvailabilityOptions = [
  {
    icon: CheckCircle2Icon,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    label: "Available",
    value: "available",
  },
  {
    icon: LockKeyholeIcon,
    iconClassName: "text-destructive",
    label: "Unavailable",
    value: "unavailable",
  },
  {
    icon: UserRoundXIcon,
    iconClassName: "text-destructive",
    label: "Deleted",
    value: "deleted",
  },
] as const;

interface AllDialogsToolbarProps {
  availabilityFilters: ReadonlySet<DialogAvailabilityFilter>;
  dialogCount: number;
  isBulkPending: boolean;
  isRowMutationPending: boolean;
  onClearFilters: () => void;
  onClearSelection: () => void;
  onSearchChange: (value: string) => void;
  onSetBulkTracking: (trackingEnabled: boolean) => Promise<void>;
  onToggleAvailabilityFilter: (filter: DialogAvailabilityFilter) => void;
  onToggleTypeFilter: (filter: DialogTypeFilter) => void;
  searchValue: string;
  selectedCount: number;
  typeFilters: ReadonlySet<DialogTypeFilter>;
}

export function AllDialogsToolbar({
  availabilityFilters,
  dialogCount,
  isBulkPending,
  isRowMutationPending,
  onClearFilters,
  onClearSelection,
  onSearchChange,
  onSetBulkTracking,
  onToggleAvailabilityFilter,
  onToggleTypeFilter,
  searchValue,
  selectedCount,
  typeFilters,
}: AllDialogsToolbarProps) {
  const activeFilterCount = typeFilters.size + availabilityFilters.size;

  return (
    <div className="flex min-h-12 shrink-0 flex-col gap-2 border-b bg-card p-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search dialogs"
            className="pl-8 focus-visible:ring-0"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name or username..."
            value={searchValue}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Filter dialogs"
                size="default"
                variant="outline"
              />
            }
          >
            <ListFilterIcon data-icon="inline-start" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Type</DropdownMenuLabel>
              {dialogTypeOptions.map((option) => {
                const Icon = option.icon;

                return (
                  <DropdownMenuCheckboxItem
                    checked={typeFilters.has(option.value)}
                    key={option.value}
                    onCheckedChange={() => onToggleTypeFilter(option.value)}
                  >
                    <Icon className={option.iconClassName} />
                    {option.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Availability</DropdownMenuLabel>
              {dialogAvailabilityOptions.map((option) => {
                const Icon = option.icon;

                return (
                  <DropdownMenuCheckboxItem
                    checked={availabilityFilters.has(option.value)}
                    key={option.value}
                    onCheckedChange={() =>
                      onToggleAvailabilityFilter(option.value)
                    }
                  >
                    <Icon className={option.iconClassName} />
                    {option.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuGroup>
            {activeFilterCount > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClearFilters}>
                  Clear filters
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="whitespace-nowrap px-1 text-muted-foreground text-sm">
          {dialogCount} dialogs
        </span>
      </div>
      {selectedCount > 0 ? (
        <div className="flex min-h-8 shrink-0 items-center justify-end gap-2">
          <span className="px-1 font-medium text-sm">
            {selectedCount} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isBulkPending || isRowMutationPending}
              render={<Button size="default" />}
            >
              Change tracking
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  Apply to {selectedCount} selected
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="items-start py-1.5"
                  onClick={() => onSetBulkTracking(true)}
                >
                  <span className="grid gap-0.5">
                    <span className="font-medium">Track</span>
                    <span className="text-muted-foreground text-xs">
                      Add to Tracked dialogs
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="items-start py-1.5"
                  onClick={() => onSetBulkTracking(false)}
                >
                  <span className="grid gap-0.5">
                    <span className="font-medium">Stop tracking</span>
                    <span className="text-muted-foreground text-xs">
                      Remove from Tracked dialogs
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            disabled={isBulkPending}
            onClick={onClearSelection}
            size="default"
            variant="ghost"
          >
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}
