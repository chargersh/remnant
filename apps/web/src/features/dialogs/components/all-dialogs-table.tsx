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
import { AllDialogsToolbar } from "./all-dialogs-toolbar";

export function AllDialogsTable({ dialogs }: { dialogs: DialogListItem[] }) {
  const setTracking = useMutation(api.telegramDialogs.setTracking);
  const setTrackingBulk = useMutation(api.telegramDialogs.setTrackingBulk);
  const [pendingDialogIds, setPendingDialogIds] = useState<
    ReadonlySet<Id<"telegramDialogs">>
  >(() => new Set());
  const [isBulkPending, setIsBulkPending] = useState(false);

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

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <AllDialogsToolbar
        dialogCount={dialogs.length}
        isBulkPending={isBulkPending}
        isRowMutationPending={isRowMutationPending}
        onClearSelection={() => table.resetRowSelection(true)}
        onSetBulkTracking={handleBulkTracking}
        selectedCount={selectedCount}
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
          {table.getRowModel().rows.map((row) => (
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
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
