"use client";

import { env } from "@remnant/env/web";
import { Toaster } from "@remnant/ui/components/sonner";
import { ConvexProvider, ConvexReactClient } from "convex/react";

import { ThemeProvider } from "./theme-provider";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ConvexProvider client={convex}>{children}</ConvexProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
