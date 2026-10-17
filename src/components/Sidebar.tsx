"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { sections, settingsItem, isActive, type NavItem } from "./shell/nav";
import { cx } from "./ui";

function Item({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cx(
        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
        active ? "bg-[#1a1d24] text-white" : "text-[#6b7280] hover:bg-white hover:text-[#1a1d24]",
      )}
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

// Desktop sidebar. Hidden on phones by CSS, so there is no flash or layout jump.
export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="hidden md:flex flex-col h-dvh sticky top-0 bg-white/60 backdrop-blur-xl border-r border-white/70 z-30 shrink-0"
    >
      <div className="flex items-center justify-between px-4 h-16">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#1a1d24] flex items-center justify-center text-white text-xs font-semibold">H</div>
            <span className="font-semibold tracking-tight">Hermes</span>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} aria-label="Collapse sidebar" className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6b7280] hover:bg-white/80 transition">
          <ChevronLeft size={18} className={`transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div className="px-3 flex flex-col gap-2">
        <Link href="/chat?new=1" className={cx("flex items-center justify-center gap-2 bg-[#1a1d24] text-white rounded-2xl text-sm font-medium min-h-10 hover:opacity-90", collapsed ? "px-0" : "px-3")}>
          <Plus size={16} />
          {!collapsed && "New Chat"}
        </Link>
        <button onClick={onSearch} className={cx("flex items-center gap-2 text-sm text-[#9ca3af] bg-white/70 border border-[#e8eaee]/80 rounded-2xl min-h-10 hover:text-[#1a1d24]", collapsed ? "justify-center" : "px-3")}>
          <Search size={15} />
          {!collapsed && (
            <>
              <span>Search</span>
              <kbd className="ml-auto text-[10px] font-sans border border-[#e8eaee] rounded-md px-1.5 py-0.5">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      <div className="flex-1 py-3 overflow-y-auto no-scrollbar">
        {sections.map((s) => (
          <div key={s.title} className="mb-3">
            {!collapsed && <p className="px-6 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">{s.title}</p>}
            <nav className="flex flex-col gap-0.5 px-3">
              {s.items.map((i) => (
                <Item key={i.href} item={i} collapsed={collapsed} />
              ))}
            </nav>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-[#e8eaee]/80">
        <Item item={settingsItem} collapsed={collapsed} />
      </div>
    </motion.aside>
  );
}
