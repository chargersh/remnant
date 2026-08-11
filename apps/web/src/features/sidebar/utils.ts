import type { TelegramAccount, TrackedDialog } from "./types";

export const accountHandle = (account: TelegramAccount) =>
  account.username ? `@${account.username}` : account.telegramAccountId;

export const dialogHandle = (dialog: TrackedDialog) =>
  dialog.username ? `@${dialog.username}` : dialog.telegramDialogId;

export const accountInitial = (account: TelegramAccount) =>
  account.displayName.trim().charAt(0).toUpperCase() || "?";
