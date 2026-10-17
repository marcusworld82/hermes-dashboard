"use client";

import { Suspense, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./shell/MobileNav";
import { CommandPalette } from "./shell/CommandPalette";
import { QuickChat } from "./shell/QuickChat";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState(false);
  return (
    <div className="flex min-h-dvh w-full max-w-[100vw]">
      {/* These read the current URL, so they render at request time. */}
      <Suspense fallback={<div className="hidden md:block w-[240px] shrink-0" />}>
        <Sidebar onSearch={() => setSearch(true)} />
      </Suspense>
      <Suspense>
        <MobileNav onSearch={() => setSearch(true)} />
      </Suspense>
      <main className="app-main flex-1 min-w-0 w-full">{children}</main>
      <Suspense>
        <QuickChat />
      </Suspense>
      <CommandPalette open={search} setOpen={setSearch} />
    </div>
  );
}
