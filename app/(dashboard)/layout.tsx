import type { ReactNode } from "react";
import { AppHeader } from "../../src/components/dashboard/AppHeader";
import { DashboardProvider } from "../../src/components/dashboard/DashboardContext";
import { DashboardNav } from "../../src/components/dashboard/DashboardNav";


export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <main className="shell">
        <AppHeader />
        <DashboardNav />

        {children}
      </main>
    </DashboardProvider>
  );
}
