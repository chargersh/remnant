import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import { Button } from "@remnant/ui/components/button";
import { Checkbox } from "@remnant/ui/components/checkbox";
import { Spinner } from "@remnant/ui/components/spinner";
import {
  columnFilteringFeature,
  constructFilterFn,
  createColumnHelper,
  createFilteredRowModel,
  filterFn_arrHas,
  filterFn_includesString,
  globalFilteringFeature,
  rowSelectionFeature,
  tableFeatures,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import {
  getDialogAvailability,
  getDialogSearchText,
  getDialogType,
} from "../dialog-classification";
import type { DialogListItem } from "../types";
import {
  DialogAvailability,
  DialogIdentity,
  DialogLocation,
  DialogSyncStatus,
  DialogType,
} from "./dialog-presentation";

const dialogSearchFilter = constructFilterFn({
  ...filterFn_includesString,
  resolveFilterValue: (value) => String(value).trim().toLowerCase(),
});

export const allDialogsTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSelectionFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    arrHas: filterFn_arrHas,
    dialogSearch: dialogSearchFilter,
  },
});

const columnHelper = createColumnHelper<
  typeof allDialogsTableFeatures,
  DialogListItem
>();

interface CreateAllDialogsColumnsOptions {
  isBulkPending: boolean;
  onSetTracking: (
    dialogId: Id<"telegramDialogs">,
    trackingEnabled: boolean
  ) => Promise<void>;
  pendingDialogIds: ReadonlySet<Id<"telegramDialogs">>;
}

export function createAllDialogsColumns({
  isBulkPending,
  onSetTracking,
  pendingDialogIds,
}: CreateAllDialogsColumnsOptions) {
  return columnHelper.columns([
    columnHelper.display({
      id: "select",
      header: ({ table }) => {
        const isAllVisibleRowsSelected = table.getIsAllRowsSelected();
        const hasVisibleSelectedRows =
          table.getFilteredSelectedRowModel().rows.length > 0;

        return (
          <Checkbox
            aria-label="Select all visible dialogs"
            checked={isAllVisibleRowsSelected}
            indeterminate={hasVisibleSelectedRows && !isAllVisibleRowsSelected}
            onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.name}`}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
        />
      ),
    }),
    columnHelper.accessor(getDialogSearchText, {
      id: "name",
      header: "Dialog",
      cell: ({ row }) => <DialogIdentity dialog={row.original} />,
    }),
    columnHelper.accessor(getDialogType, {
      id: "type",
      enableGlobalFilter: false,
      filterFn: "arrHas",
      header: "Type",
      cell: ({ row }) => <DialogType dialog={row.original} />,
    }),
    columnHelper.accessor("archived", {
      enableGlobalFilter: false,
      header: "Location",
      cell: ({ row }) => <DialogLocation dialog={row.original} />,
    }),
    columnHelper.accessor(getDialogAvailability, {
      id: "availability",
      enableGlobalFilter: false,
      filterFn: "arrHas",
      header: "Availability",
      cell: ({ row }) => <DialogAvailability dialog={row.original} />,
    }),
    columnHelper.accessor("sourceStatus", {
      enableGlobalFilter: false,
      header: "Remnant sync",
      cell: ({ row }) => <DialogSyncStatus dialog={row.original} />,
    }),
    columnHelper.display({
      id: "tracking",
      header: "Tracking",
      cell: ({ row }) => {
        const dialog = row.original;
        const isPending = pendingDialogIds.has(dialog.dialogId);
        let buttonContent: ReactNode = dialog.trackingEnabled
          ? "Tracking"
          : "Track";

        if (isPending) {
          buttonContent = <Spinner className="size-3.5" />;
        }

        return (
          <Button
            aria-label={`${dialog.trackingEnabled ? "Stop tracking" : "Track"} ${dialog.name}`}
            aria-pressed={dialog.trackingEnabled}
            className="w-24"
            disabled={isBulkPending || isPending}
            onClick={() =>
              onSetTracking(dialog.dialogId, !dialog.trackingEnabled)
            }
            size="sm"
            variant={dialog.trackingEnabled ? "outline" : "default"}
          >
            {buttonContent}
          </Button>
        );
      },
    }),
  ]);
}
