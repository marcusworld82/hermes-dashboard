"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronDown, Plus, Search } from "lucide-react";
import { sections, settingsItem, isActive, type NavItem } from "./shell/nav";
import { cx } from "./ui";
import { useApi } from "@/lib/client";

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
const sectionKey = "hermes-sidebar-sections";
function subscribeSections(callback:()=>void) {
  window.addEventListener("storage",callback); window.addEventListener("hermes-sidebar",callback);
  return ()=>{window.removeEventListener("storage",callback);window.removeEventListener("hermes-sidebar",callback);};
}
function readSections(){try{return localStorage.getItem(sectionKey)||"{}";}catch{return "{}";}}
export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: history } = useApi<{threads:{id:string;title:string}[]}>("/api/chat/recent", 30000);
  const saved = useSyncExternalStore(subscribeSections,readSections,()=>"{}");
  let closed:Record<string,boolean>={Team:true,Business:true};
  try {closed={...closed,...JSON.parse(saved)};} catch {}
  function toggleSection(title:string){
    try {localStorage.setItem(sectionKey,JSON.stringify({...closed,[title]:!closed[title]}));window.dispatchEvent(new Event("hermes-sidebar"));}catch{}
  }
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
            <div className="w-8 h-8 rounded-xl bg-[#1a1d24] flex items-center justify-center text-white text-xs font-semibold">M</div>
            <span className="font-semibold tracking-tight">Marcus OS</span>
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
            {!collapsed && <button onClick={()=>toggleSection(s.title)} aria-expanded={!closed[s.title]} className="w-full flex items-center justify-between px-6 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">{s.title}<ChevronDown size={13} className={closed[s.title]?"-rotate-90":""}/></button>}
            {(collapsed || !closed[s.title]) && <nav className="flex flex-col gap-0.5 px-3">
              {s.items.map((i) => (
                <Item key={i.href} item={i} collapsed={collapsed} />
              ))}
            </nav>}
          </div>
        ))}
        {!collapsed && <details className="mx-3 mt-3"><summary className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] cursor-pointer px-3 py-2">Recent chats</summary><nav className="space-y-1">{history?.threads.map(thread=><Link href={`/chat?t=${encodeURIComponent(thread.id)}`} key={thread.id} className="block truncate rounded-xl px-3 py-2 text-xs hover:bg-white">{thread.title}</Link>)}{!history?.threads.length&&<p className="text-xs text-[var(--text-muted)] px-3 py-2">No conversations yet.</p>}</nav></details>}
      </div>
      <div className="p-3 border-t border-[#e8eaee]/80">
        <Item item={settingsItem} collapsed={collapsed} />
      </div>
    </motion.aside>
  );
}
