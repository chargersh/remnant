"use client";

import { api } from "@remnant/backend/convex/_generated/api";
import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@remnant/ui/components/table";
import { cn } from "@remnant/ui/lib/utils";
import { useTable } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { DialogListItem } from "../types";
import {
  allDialogsTableFeatures,
  createAllDialogsColumns,
} from "./all-dialogs-columns";
import {
  AllDialogsToolbar,
  type DialogAvailabilityFilter,
  type DialogTypeFilter,
} from "./all-dialogs-toolbar";

export function AllDialogsTable({ dialogs }: { dialogs: DialogListItem[] }) {
  const setTracking = useMutation(api.telegramDialogs.setTracking);
  const setTrackingBulk = useMutation(api.telegramDialogs.setTrackingBulk);
  const [searchValue, setSearchValue] = useState("");
  const [typeFilters, setTypeFilters] = useState<ReadonlySet<DialogTypeFilter>>(
    () => new Set()
  );
  const [availabilityFilters, setAvailabilityFilters] = useState<
    ReadonlySet<DialogAvailabilityFilter>
  >(() => new Set());
  const [pendingDialogIds, setPendingDialogIds] = useState<
    ReadonlySet<Id<"telegramDialogs">>
  >(() => new Set());
  const [isBulkPending, setIsBulkPending] = useState(false);
  const filteredDialogs = useMemo(() => {
    const query = normalizeSearchValue(searchValue);

    return dialogs.filter((dialog) => {
      const username = dialog.username
        ? normalizeSearchValue(dialog.username)
        : "";
      const matchesSearch =
        query.length === 0 ||
        normalizeSearchValue(dialog.name).includes(query) ||
        username.includes(query);
      const matchesType =
        typeFilters.size === 0 || typeFilters.has(getDialogType(dialog));
      const matchesAvailability =
        availabilityFilters.size === 0 ||
        availabilityFilters.has(getDialogAvailability(dialog));

      return matchesSearch && matchesType && matchesAvailability;
    });
  }, [availabilityFilters, dialogs, searchValue, typeFilters]);

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
    data: filteredDialogs,
    features: allDialogsTableFeatures,
    getRowId: (dialog) => dialog.dialogId,
  });
  const selectedCount = table.getSelectedRowModel().rows.length;
  const isRowMutationPending = pendingDialogIds.size > 0;

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
    setTypeFilters((current) => toggleSetValue(current, filter));
  };

  const handleToggleAvailabilityFilter = (filter: DialogAvailabilityFilter) => {
    setAvailabilityFilters((current) => toggleSetValue(current, filter));
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <AllDialogsToolbar
        availabilityFilters={availabilityFilters}
        dialogCount={filteredDialogs.length}
        isBulkPending={isBulkPending}
        isRowMutationPending={isRowMutationPending}
        onClearFilters={() => {
          setTypeFilters(new Set());
          setAvailabilityFilters(new Set());
        }}
        onClearSelection={() => table.resetRowSelection(true)}
        onSearchChange={setSearchValue}
        onSetBulkTracking={handleBulkTracking}
        onToggleAvailabilityFilter={handleToggleAvailabilityFilter}
        onToggleTypeFilter={handleToggleTypeFilter}
        searchValue={searchValue}
        selectedCount={selectedCount}
        typeFilters={typeFilters}
      />
      <Table>
        <TableHeader className="bg-muted/10">
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
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                data-state={row.getIsSelected() ? "selected" : undefined}
                key={row.id}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell
                    className={columnClassName(cell.column.id)}
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
    </div>
  );
}

function getDialogType(dialog: DialogListItem): DialogTypeFilter {
  if (dialog.isSelf) {
    return "saved";
  }

  if (dialog.isBot) {
    return "bot";
  }

  return dialog.type === "user" ? "person" : dialog.type;
}

function getDialogAvailability(
  dialog: DialogListItem
): DialogAvailabilityFilter {
  if (dialog.isDeleted) {
    return "deleted";
  }

  return dialog.availability === "forbidden" ? "unavailable" : "available";
}

function toggleSetValue<Value>(values: ReadonlySet<Value>, value: Value) {
  const nextValues = new Set(values);

  if (nextValues.has(value)) {
    nextValues.delete(value);
  } else {
    nextValues.add(value);
  }

  return nextValues;
}

function normalizeSearchValue(value: string) {
  const trimmedValue = value.trim();
  const valueWithoutAt = trimmedValue.startsWith("@")
    ? trimmedValue.slice(1)
    : trimmedValue;

  return valueWithoutAt.toLocaleLowerCase();
}

function columnClassName(columnId: string) {
  return cn({
    "hidden md:table-cell": columnId === "type",
    "hidden lg:table-cell":
      columnId === "archived" || columnId === "sourceStatus",
    "hidden xl:table-cell": columnId === "availability",
    "w-10": columnId === "select",
    "sticky right-0 z-10 w-32 bg-card text-left lg:static lg:z-auto lg:bg-transparent":
      columnId === "tracking",
  });
}
