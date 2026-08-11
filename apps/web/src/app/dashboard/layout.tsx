import { SidebarInset, SidebarProvider } from "@remnant/ui/components/sidebar";
import type { ReactNode } from "react";
import { SelectedAccountProvider } from "@/features/accounts/selected-account-context";
import { AppSidebar } from "@/features/sidebar/app-sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SelectedAccountProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </SelectedAccountProvider>
  );
}
