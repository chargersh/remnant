import { Button } from "@remnant/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@remnant/ui/components/dropdown-menu";
import { Input } from "@remnant/ui/components/input";
import { ChevronDownIcon, ListFilterIcon, SearchIcon } from "lucide-react";

interface AllDialogsToolbarProps {
  dialogCount: number;
  isBulkPending: boolean;
  isRowMutationPending: boolean;
  onClearSelection: () => void;
  onSetBulkTracking: (trackingEnabled: boolean) => Promise<void>;
  selectedCount: number;
}

export function AllDialogsToolbar({
  dialogCount,
  isBulkPending,
  isRowMutationPending,
  onClearSelection,
  onSetBulkTracking,
  selectedCount,
}: AllDialogsToolbarProps) {
  return (
    <div className="flex min-h-12 flex-col gap-2 border-b bg-muted/20 p-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search dialogs"
            className="pl-8"
            placeholder="Search name or username..."
            readOnly
          />
        </div>
        <Button aria-label="Filter dialogs" size="sm" variant="outline">
          <ListFilterIcon data-icon="inline-start" />
          Filters
        </Button>
        <span className="whitespace-nowrap px-1 text-muted-foreground text-sm">
          {dialogCount} dialogs
        </span>
      </div>
      {selectedCount > 0 ? (
        <div className="flex min-h-7 shrink-0 items-center justify-end gap-2">
          <span className="px-1 font-medium text-sm">
            {selectedCount} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isBulkPending || isRowMutationPending}
              render={<Button size="sm" />}
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
            size="sm"
            variant="ghost"
          >
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}
