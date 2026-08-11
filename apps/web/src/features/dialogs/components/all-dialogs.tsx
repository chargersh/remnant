"use client";

import { api } from "@remnant/backend/convex/_generated/api";
import { Skeleton } from "@remnant/ui/components/skeleton";
import { useQuery } from "convex/react";
import { useSelectedAccount } from "@/features/accounts/selected-account-context";
import { AllDialogsTable } from "./all-dialogs-table";

const skeletonRows = ["one", "two", "three", "four", "five"] as const;

function DialogsTableSkeleton() {
  return (
    <div className="grid gap-2 rounded-xl border p-3">
      {skeletonRows.map((row) => (
        <Skeleton className="h-12 w-full" key={row} />
      ))}
    </div>
  );
}

function DialogsEmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 max-w-md text-muted-foreground text-sm">
        {description}
      </p>
    </div>
  );
}

export function AllDialogs() {
  const { isAccountLoading, selectedAccount, selectedAccountId } =
    useSelectedAccount();
  const dialogs = useQuery(
    api.telegramDialogs.list,
    selectedAccountId ? { accountId: selectedAccountId } : "skip"
  );
  const isLoading =
    isAccountLoading ||
    (selectedAccountId !== undefined && dialogs === undefined);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <header>
        <h1 className="font-semibold text-xl">All dialogs</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {selectedAccount
            ? `Choose which dialogs to track from ${selectedAccount.displayName}.`
            : "Choose a Telegram account to see its dialogs."}
        </p>
      </header>

      {isLoading ? <DialogsTableSkeleton /> : null}
      {isLoading || selectedAccountId ? null : (
        <DialogsEmptyState
          description="Connect or select a Telegram account before choosing dialogs to track."
          title="No Telegram account selected"
        />
      )}
      {!isLoading && selectedAccountId && dialogs?.length === 0 ? (
        <DialogsEmptyState
          description="Run a dialog sync to discover people, groups, and channels from this account."
          title="No dialogs found"
        />
      ) : null}
      {!isLoading && selectedAccountId && dialogs && dialogs.length > 0 ? (
        <AllDialogsTable dialogs={dialogs} key={selectedAccountId} />
      ) : null}
    </div>
  );
}
