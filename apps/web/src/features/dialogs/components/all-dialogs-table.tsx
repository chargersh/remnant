"use client";

import { api } from "@remnant/backend/convex/_generated/api";
import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import { ScrollArea } from "@remnant/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@remnant/ui/components/table";
import { cn } from "@remnant/ui/lib/utils";
import type {
  ColumnFiltersState,
  RowSelectionState,
} from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type DialogAvailabilityFilter,
  type DialogTypeFilter,
  isDialogAvailabilityFilter,
  isDialogTypeFilter,
} from "../dialog-classification";
import type { DialogListItem } from "../types";
import {
  allDialogsTableFeatures,
  createAllDialogsColumns,
} from "./all-dialogs-columns";
import { AllDialogsToolbar } from "./all-dialogs-toolbar";

export function AllDialogsTable({ dialogs }: { dialogs: DialogListItem[] }) {
  const setTracking = useMutation(api.telegramDialogs.setTracking);
  const setTrackingBulk = useMutation(api.telegramDialogs.setTrackingBulk);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pendingDialogIds, setPendingDialogIds] = useState<
    ReadonlySet<Id<"telegramDialogs">>
  >(() => new Set());
  const [isBulkPending, setIsBulkPending] = useState(false);

  useEffect(() => {
    const availableDialogIds = new Set<string>(
      dialogs.map((dialog) => dialog.dialogId)
    );

    setRowSelection((current) => {
      const next: RowSelectionState = {};
      let changed = false;

      for (const [dialogId, selected] of Object.entries(current)) {
        if (availableDialogIds.has(dialogId)) {
          next[dialogId] = selected;
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [dialogs]);

  const handleSetTracking = useCallback(
    async (dialogId: Id<"telegramDialogs">, trackingEnabled: boolean) => {
      setPendingDialogIds((current) => new Set(current).add(dialogId));

      try {
        await setTracking({ dialogId, trackingEnabled });
      } catch {
        toast.error("Could not update tracking");
      } finally {
        setPendingDialogIds((current) => {
          const next = new Set(current);
          next.delete(dialogId);
          return next;
        });
      }
    },
    [setTracking]
  );
  const columns = useMemo(
    () =>
      createAllDialogsColumns({
        isBulkPending,
        onSetTracking: handleSetTracking,
        pendingDialogIds,
      }),
    [handleSetTracking, isBulkPending, pendingDialogIds]
  );
  const table = useTable({
    columns,
    data: dialogs,
    features: allDialogsTableFeatures,
    getRowId: (dialog) => dialog.dialogId,
    globalFilterFn: "dialogSearch",
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    state: {
      columnFilters,
      globalFilter,
      rowSelection,
    },
  });
  const selectedCount = table.getSelectedRowModel().rows.length;
  const isRowMutationPending = pendingDialogIds.size > 0;
  const visibleRows = table.getRowModel().rows;
  const typeFilters = getColumnFilterValues(
    columnFilters,
    "type",
    isDialogTypeFilter
  );
  const availabilityFilters = getColumnFilterValues(
    columnFilters,
    "availability",
    isDialogAvailabilityFilter
  );

  const handleBulkTracking = async (trackingEnabled: boolean) => {
    const dialogIds = table
      .getSelectedRowModel()
      .rows.map((row) => row.original.dialogId);

    if (dialogIds.length === 0) {
      return;
    }

    setIsBulkPending(true);

    try {
      const result = await setTrackingBulk({ dialogIds, trackingEnabled });
      const noun = result.updatedCount === 1 ? "dialog" : "dialogs";

      toast.success(
        result.updatedCount === 0
          ? "No tracking changes were needed"
          : `Updated ${result.updatedCount} ${noun}`
      );
      table.resetRowSelection(true);
    } catch {
      toast.error("Could not update selected dialogs");
    } finally {
      setIsBulkPending(false);
    }
  };

  const handleToggleTypeFilter = (filter: DialogTypeFilter) => {
    setColumnFilters((current) =>
      toggleColumnFilterValue(current, "type", filter, isDialogTypeFilter)
    );
  };

  const handleToggleAvailabilityFilter = (filter: DialogAvailabilityFilter) => {
    setColumnFilters((current) =>
      toggleColumnFilterValue(
        current,
        "availability",
        filter,
        isDialogAvailabilityFilter
      )
    );
  };

  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden rounded-xl border bg-card **:data-[slot=table-container]:overflow-visible">
      <AllDialogsToolbar
        availabilityFilters={availabilityFilters}
        dialogCount={visibleRows.length}
        isBulkPending={isBulkPending}
        isRowMutationPending={isRowMutationPending}
        onClearFilters={() => setColumnFilters([])}
        onClearSelection={() => table.resetRowSelection(true)}
        onSearchChange={setGlobalFilter}
        onSetBulkTracking={handleBulkTracking}
        onToggleAvailabilityFilter={handleToggleAvailabilityFilter}
        onToggleTypeFilter={handleToggleTypeFilter}
        searchValue={globalFilter}
        selectedCount={selectedCount}
        typeFilters={typeFilters}
      />
      <div className="shrink-0">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={cn(
                      "h-12 text-xs",
                      columnClassName(header.column.id),
                      header.column.id !== "select" &&
                        header.column.id !== "tracking" &&
                        "border-border/60 border-r"
                    )}
                    key={header.id}
                  >
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
        </Table>
      </div>
      <ScrollArea className="custom-scrollbar **:data-[slot=scroll-area-viewport]:overflow-x-hidden! min-h-0 flex-1 **:data-[slot=scroll-area-viewport]:overscroll-y-contain **:data-[slot=scroll-area-viewport]:overscroll-x-none">
        <Table className="table-fixed">
          <TableBody>
            {visibleRows.length > 0 ? (
              visibleRows.map((row) => (
                <TableRow
                  className="h-12"
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  key={row.id}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell
                      className={cn("py-2", columnClassName(cell.column.id))}
                      key={cell.id}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-12 text-center text-muted-foreground"
                  colSpan={columns.length}
                >
                  No dialogs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

function getColumnFilterValues<Value extends string>(
  filters: ColumnFiltersState,
  columnId: string,
  isValue: (value: unknown) => value is Value
) {
  const value = filters.find((filter) => filter.id === columnId)?.value;

  return new Set(Array.isArray(value) ? value.filter(isValue) : []);
}

function toggleColumnFilterValue<Value extends string>(
  filters: ColumnFiltersState,
  columnId: string,
  value: Value,
  isValue: (candidate: unknown) => candidate is Value
) {
  const nextValues = getColumnFilterValues(filters, columnId, isValue);

  if (nextValues.has(value)) {
    nextValues.delete(value);
  } else {
    nextValues.add(value);
  }

  const otherFilters = filters.filter((filter) => filter.id !== columnId);

  return nextValues.size === 0
    ? otherFilters
    : [...otherFilters, { id: columnId, value: [...nextValues] }];
}

function columnClassName(columnId: string) {
  return cn({
    "hidden md:table-cell md:w-28": columnId === "type",
    "hidden lg:table-cell lg:w-28":
      columnId === "archived" || columnId === "sourceStatus",
    "hidden xl:table-cell xl:w-36": columnId === "availability",
    "w-10!": columnId === "select",
    "sticky right-0 z-10 w-32 bg-card text-left lg:static lg:z-auto lg:bg-transparent":
      columnId === "tracking",
  });
}
