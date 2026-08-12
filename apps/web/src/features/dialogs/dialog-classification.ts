import type { DialogListItem } from "./types";

export const dialogTypeFilterValues = [
  "saved",
  "person",
  "bot",
  "group",
  "channel",
] as const;

export type DialogTypeFilter = (typeof dialogTypeFilterValues)[number];

export const dialogAvailabilityFilterValues = [
  "available",
  "unavailable",
  "deleted",
] as const;

export type DialogAvailabilityFilter =
  (typeof dialogAvailabilityFilterValues)[number];

export function getDialogType(dialog: DialogListItem): DialogTypeFilter {
  if (dialog.isSelf) {
    return "saved";
  }

  if (dialog.isBot) {
    return "bot";
  }

  return dialog.type === "user" ? "person" : dialog.type;
}

export function getDialogAvailability(
  dialog: DialogListItem
): DialogAvailabilityFilter {
  if (dialog.isDeleted) {
    return "deleted";
  }

  return dialog.availability === "forbidden" ? "unavailable" : "available";
}

export function getDialogSearchText(dialog: DialogListItem) {
  return dialog.username ? `${dialog.name} @${dialog.username}` : dialog.name;
}

export function isDialogTypeFilter(value: unknown): value is DialogTypeFilter {
  return dialogTypeFilterValues.some((candidate) => candidate === value);
}

export function isDialogAvailabilityFilter(
  value: unknown
): value is DialogAvailabilityFilter {
  return dialogAvailabilityFilterValues.some(
    (candidate) => candidate === value
  );
}
