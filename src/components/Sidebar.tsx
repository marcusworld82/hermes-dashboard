"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Kanban,
  MessageSquare,
  Bot,
  Settings,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/kanban", label: "Kanban", icon: Kanban },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Bot },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1 px-3">
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
              active
                ? "bg-[#1a1d24] text-white"
                : "text-[#6b7280] hover:bg-white hover:text-[#1a1d24]"
            }`}
          >
            <Icon size={18} strokeWidth={1.75} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar — only mounted on md+ */}
      {isDesktop && (
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 72 : 240 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex flex-col h-screen sticky top-0 bg-white/60 backdrop-blur-xl border-r border-white/70 z-30 shrink-0"
        >
          <div className="flex items-center justify-between px-4 h-16">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#1a1d24] flex items-center justify-center text-white text-xs font-semibold">
                  H
                </div>
                <span className="font-semibold tracking-tight">Hermes</span>
              </div>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6b7280] hover:bg-white/80 transition"
            >
              <ChevronLeft
                size={18}
                className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          <div className="flex-1 py-4 overflow-y-auto">
            <nav className="flex flex-col gap-1 px-3">
              {nav.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "bg-[#1a1d24] text-white"
                        : "text-[#6b7280] hover:bg-white hover:text-[#1a1d24]"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="p-3 border-t border-[#e8eaee]/80">
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-[#6b7280] hover:bg-white/80 transition"
            >
              <Settings size={18} />
              {!collapsed && <span>Settings</span>}
            </Link>
          </div>
        </motion.aside>
      )}

      {/* Mobile top bar */}
      {!isDesktop && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-xl border-b border-[#e8eaee] flex items-center justify-between px-4 z-40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#1a1d24] text-white text-xs font-semibold flex items-center justify-center">
              H
            </div>
            <span className="font-semibold text-sm">Hermes</span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#1a1d24] bg-white/60"
          >
            <Menu size={20} />
          </button>
        </div>
      )}

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && !isDesktop && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/25 z-50"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed top-0 left-0 bottom-0 w-[260px] bg-white z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 h-14 border-b border-[#e8eaee]">
                <span className="font-semibold">Menu</span>
                <button onClick={() => setMobileOpen(false)} className="p-1">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 py-4 overflow-y-auto">
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="p-3 border-t border-[#e8eaee]">
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-[#6b7280]"
                >
                  <Settings size={18} />
                  <span>Settings</span>
                </Link>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
