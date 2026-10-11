"use client";

import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <main className="flex-1 min-w-0 w-full pt-14 md:pt-0">{children}</main>
    </div>
  );
}
