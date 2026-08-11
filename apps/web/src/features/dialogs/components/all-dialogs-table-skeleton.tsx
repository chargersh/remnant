import { Skeleton } from "@remnant/ui/components/skeleton";
import { TableCell, TableRow } from "@remnant/ui/components/table";
import { cn } from "@remnant/ui/lib/utils";

const skeletonRows = Array.from({ length: 16 }, (_, index) => `row-${index}`);

type DialogColumnId =
  | "select"
  | "name"
  | "type"
  | "archived"
  | "availability"
  | "sourceStatus"
  | "tracking";

interface AllDialogsTableSkeletonProps {
  cellClassName: (columnId: DialogColumnId) => string;
}

export function AllDialogsTableSkeleton({
  cellClassName,
}: AllDialogsTableSkeletonProps) {
  return skeletonRows.map((row, index) => (
    <TableRow aria-hidden="true" className="h-12" key={row}>
      <TableCell className={cellClassName("select")}>
        <Skeleton className="size-4 rounded-lg" />
      </TableCell>
      <TableCell className={cellClassName("name")}>
        <div className="flex min-w-56 items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="grid gap-1">
            <Skeleton
              className={cn("h-3.5", index % 3 === 0 ? "w-24" : "w-32")}
            />
            <Skeleton
              className={cn("h-3", index % 2 === 0 ? "w-20" : "w-28")}
            />
          </div>
        </div>
      </TableCell>
      <TableCell className={cellClassName("type")}>
        <Skeleton className="h-5 w-16 rounded-full" />
      </TableCell>
      <TableCell className={cellClassName("archived")}>
        <Skeleton className="h-5 w-16 rounded-full" />
      </TableCell>
      <TableCell className={cellClassName("availability")}>
        <Skeleton className="h-5 w-20 rounded-full" />
      </TableCell>
      <TableCell className={cellClassName("sourceStatus")}>
        <Skeleton className="h-5 w-20 rounded-full" />
      </TableCell>
      <TableCell className={cellClassName("tracking")}>
        <Skeleton className="h-7 w-24" />
      </TableCell>
    </TableRow>
  ));
}
