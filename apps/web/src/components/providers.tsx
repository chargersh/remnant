"use client";

import { env } from "@remnant/env/web";
import { Toaster } from "@remnant/ui/components/sonner";
import { TooltipProvider } from "@remnant/ui/components/tooltip";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

import { ThemeProvider } from "./theme-provider";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
    >
      <ConvexProvider client={convex}>
        <TooltipProvider>{children}</TooltipProvider>
      </ConvexProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
