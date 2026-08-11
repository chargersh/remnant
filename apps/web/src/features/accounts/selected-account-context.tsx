"use client";

import { api } from "@remnant/backend/convex/_generated/api";
import type { Id } from "@remnant/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { TelegramAccount } from "./types";

interface SelectedAccountContextValue {
  accounts: TelegramAccount[] | undefined;
  isAccountLoading: boolean;
  selectAccount: (accountId: Id<"telegramAccounts">) => void;
  selectedAccount: TelegramAccount | undefined;
  selectedAccountId: Id<"telegramAccounts"> | undefined;
}

const SelectedAccountContext =
  createContext<SelectedAccountContextValue | null>(null);

export function SelectedAccountProvider({ children }: { children: ReactNode }) {
  const accounts = useQuery(api.telegramAccounts.list);
  const [selectedAccountId, selectAccount] = useState<Id<"telegramAccounts">>();

  useEffect(() => {
    if (accounts === undefined) {
      return;
    }

    const firstAccount = accounts[0];

    if (!firstAccount) {
      if (selectedAccountId) {
        selectAccount(undefined);
      }
      return;
    }

    if (
      !(
        selectedAccountId &&
        accounts.some((account) => account.accountId === selectedAccountId)
      )
    ) {
      selectAccount(firstAccount.accountId);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = useMemo(
    () =>
      accounts?.find((account) => account.accountId === selectedAccountId) ??
      accounts?.[0],
    [accounts, selectedAccountId]
  );
  const value = useMemo(
    () => ({
      accounts,
      isAccountLoading: accounts === undefined,
      selectAccount,
      selectedAccount,
      selectedAccountId,
    }),
    [accounts, selectedAccount, selectedAccountId]
  );

  return (
    <SelectedAccountContext value={value}>{children}</SelectedAccountContext>
  );
}

export function useSelectedAccount() {
  const context = useContext(SelectedAccountContext);

  if (!context) {
    throw new Error(
      "useSelectedAccount must be used within a SelectedAccountProvider"
    );
  }

  return context;
}
