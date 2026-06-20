import { ConvexError, v } from "convex/values";
import { customMutation } from "convex-helpers/server/customFunctions";
import { mutation } from "./_generated/server";

const requireCollectorApiKey = (apiKey: string) => {
  const expectedApiKey = process.env.COLLECTOR_API_KEY;

  if (!expectedApiKey) {
    throw new Error("COLLECTOR_API_KEY is not configured");
  }

  if (apiKey !== expectedApiKey) {
    throw new ConvexError("Unauthorized");
  }
};

export const collectorMutation = customMutation(mutation, {
  args: {
    apiKey: v.string(),
  },
  input: (ctx, args) => {
    requireCollectorApiKey(args.apiKey);

    return {
      args: {},
      ctx,
    };
  },
});
