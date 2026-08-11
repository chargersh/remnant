"use client";

import { api } from "@remnant/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useSelectedAccount } from "@/features/accounts/selected-account-context";
import { AllDialogsTable } from "./all-dialogs-table";

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
  const { isAccountLoading, selectedAccountId } = useSelectedAccount();
  const dialogs = useQuery(
    api.telegramDialogs.list,
    selectedAccountId ? { accountId: selectedAccountId } : "skip"
  );
  const isLoading =
    isAccountLoading ||
    (selectedAccountId !== undefined && dialogs === undefined);
  const hasDialogs =
    selectedAccountId !== undefined &&
    dialogs !== undefined &&
    dialogs.length > 0;

  return (
    <div className="flex h-svh max-h-svh min-h-0 flex-col gap-5 overflow-hidden overscroll-none p-5 sm:p-6 lg:p-8">
      <header className="shrink-0">
        <h1 className="font-semibold text-2xl tracking-tight">All dialogs</h1>
        <p className="mt-1.5 max-w-2xl text-muted-foreground text-sm leading-relaxed">
          Browse your conversations and choose which ones Remnant should
          preserve.
        </p>
      </header>

      {isLoading || hasDialogs ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <AllDialogsTable
            dialogs={isLoading ? [] : (dialogs ?? [])}
            isLoading={isLoading}
          />
        </div>
      ) : null}
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
    </div>
  );
}
