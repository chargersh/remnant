import { SidebarInset, SidebarProvider } from "@remnant/ui/components/sidebar";
import type { ReactNode } from "react";
import { AppSidebar } from "@/features/sidebar/app-sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
