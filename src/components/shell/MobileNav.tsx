"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { allItems, isActive, tabs } from "./nav";
import { Sheet, cx } from "../ui";

// Phone chrome: a fixed top bar and a fixed bottom tab bar, like an installed app.
export function MobileNav({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const tabItems = tabs.map((h) => allItems.find((i) => i.href === h)!);
  const moreItems = allItems.filter((i) => !tabs.includes(i.href) && !i.desktopOnly);
  const moreActive = moreItems.some((i) => isActive(pathname, i.href));
  const current = allItems.find((i) => isActive(pathname, i.href));

  return (
    <>
      <header className="md:hidden fixed top-0 inset-x-0 z-40 bg-white/85 backdrop-blur-xl border-b border-[#e8eaee]" style={{ paddingTop: "var(--safe-t)" }}>
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#1a1d24] text-white text-xs font-semibold flex items-center justify-center shrink-0">H</div>
            <span className="font-semibold text-[15px] truncate">{current?.label ?? "Hermes"}</span>
          </div>
          <button onClick={onSearch} aria-label="Search" className="w-11 h-11 -mr-2 rounded-xl flex items-center justify-center text-[#1a1d24]">
            <Search size={20} />
          </button>
        </div>
      </header>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-xl border-t border-[#e8eaee]" style={{ paddingBottom: "var(--safe-b)" }}>
        <div className="grid grid-cols-5" style={{ height: "var(--tabbar-h)" }}>
          {tabItems.map((i) => {
            const Icon = i.icon;
            const active = isActive(pathname, i.href);
            return (
              <Link key={i.href} href={i.href} className={cx("flex flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-[#1a1d24]" : "text-[#9ca3af]")}>
                <span className={cx("w-12 h-7 rounded-full flex items-center justify-center transition", active && "bg-[#1a1d24] text-white")}>
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                {i.label}
              </Link>
            );
          })}
          <button onClick={() => setMore(true)} className={cx("flex flex-col items-center justify-center gap-1 text-[11px] font-medium", moreActive ? "text-[#1a1d24]" : "text-[#9ca3af]")}>
            <span className={cx("w-12 h-7 rounded-full flex items-center justify-center", moreActive && "bg-[#1a1d24] text-white")}>
              <MoreHorizontal size={18} />
            </span>
            More
          </button>
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {moreItems.map((i) => {
            const Icon = i.icon;
            return (
              <Link key={i.href} href={i.href} onClick={() => setMore(false)} className={cx("rounded-2xl border p-4 min-h-24 flex flex-col justify-between", isActive(pathname, i.href) ? "bg-[#1a1d24] text-white border-[#1a1d24]" : "bg-[#fafbfc] border-[#e8eaee]")}>
                <Icon size={20} strokeWidth={1.8} />
                <div>
                  <p className="font-medium text-sm">{i.label}</p>
                  <p className={cx("text-xs", isActive(pathname, i.href) ? "text-white/70" : "text-[#9ca3af]")}>{i.hint}</p>
                </div>
              </Link>
            );
          })}
        </div>
        <p className="text-xs text-[#9ca3af] mt-3 leading-relaxed">The CRM opens on your Mac only. Everything else works here.</p>
      </Sheet>
    </>
  );
}
