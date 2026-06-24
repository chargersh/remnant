"use client";

import { Toaster } from "@remnant/ui/components/sonner";
import { TooltipProvider } from "@remnant/ui/components/tooltip";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./convex-provider";
import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ConvexClientProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </ConvexClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
