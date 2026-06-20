import type { Infer } from "convex/values";
import { v } from "convex/values";

export const todoValidator = v.object({
  completed: v.boolean(),
  text: v.string(),
});

export type Todo = Infer<typeof todoValidator>;
