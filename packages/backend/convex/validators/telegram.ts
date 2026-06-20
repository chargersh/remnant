import type { Infer } from "convex/values";
import { v } from "convex/values";

export const telegramIdValidator = v.string();
export const telegramDialogIdValidator = v.string();
export const telegramAccessHashValidator = v.string();

export const telegramPeerKindValidator = v.union(
  v.literal("user"),
  v.literal("chat"),
  v.literal("channel")
);

export const telegramDialogTypeValidator = v.union(
  v.literal("user"),
  v.literal("group"),
  v.literal("channel")
);

export const telegramAvailabilityValidator = v.union(
  v.literal("available"),
  v.literal("forbidden")
);

export type TelegramAvailability = Infer<typeof telegramAvailabilityValidator>;
export type TelegramAccessHash = Infer<typeof telegramAccessHashValidator>;
export type TelegramDialogId = Infer<typeof telegramDialogIdValidator>;
export type TelegramDialogType = Infer<typeof telegramDialogTypeValidator>;
export type TelegramId = Infer<typeof telegramIdValidator>;
export type TelegramPeerKind = Infer<typeof telegramPeerKindValidator>;
