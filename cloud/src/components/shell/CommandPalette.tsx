"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Sparkles, Plus } from "lucide-react";
import { allItems } from "./nav";
import { cx } from "../ui";

type Cmd = { id: string; label: string; hint: string; href: string; icon: React.ComponentType<{ size?: number }> };

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const cmds: Cmd[] = useMemo(
    () => [
      { id: "capture", label: "Capture an idea", hint: "Drop it into the pipeline", href: "/pipeline?capture=1", icon: Sparkles },
      { id: "chat", label: "New chat", hint: "Talk to the Operator", href: "/chat?new=1", icon: Plus },
      ...allItems.map((i) => ({ id: i.href, label: i.label, hint: i.hint ?? "", href: i.href, icon: i.icon })),
    ],
    [],
  );
  const list = cmds.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(q.toLowerCase()));

  const go = (c?: Cmd) => {
    if (!c) return;
    setOpen(false);
    setQ("");
    router.push(c.href);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[70] bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div
            className="fixed z-[71] left-3 right-3 top-[calc(12px+var(--safe-t))] md:left-1/2 md:right-auto md:top-24 md:w-[560px] md:-translate-x-1/2 bg-white rounded-3xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex items-center gap-2 px-4 border-b border-[#f0f1f3]">
              <Search size={18} className="text-[#9ca3af]" />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, list.length - 1));
                  if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
                  if (e.key === "Enter") go(list[sel]);
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Jump to a page or action"
                className="flex-1 h-14 bg-transparent outline-none text-base"
              />
            </div>
            <div className="max-h-[60dvh] overflow-y-auto p-2">
              {list.map((c, i) => {
                const Icon = c.icon;
                return (
                  <button key={c.id} onMouseEnter={() => setSel(i)} onClick={() => go(c)} className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left", i === sel ? "bg-[#f4f5f7]" : "")}>
                    <span className="w-8 h-8 rounded-xl bg-[#f4f5f7] flex items-center justify-center text-[#1a1d24]">
                      <Icon size={16} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium">{c.label}</span>
                      <span className="block text-xs text-[#9ca3af] truncate">{c.hint}</span>
                    </span>
                  </button>
                );
              })}
              {list.length === 0 && <p className="text-sm text-[#9ca3af] p-4 text-center">Nothing matches.</p>}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
