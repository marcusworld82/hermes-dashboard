"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertCircle, Power } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { clsx } from "clsx";

export function cx(...v: Parameters<typeof clsx>) {
  return clsx(...v);
}

export function Page({ children, wide, className }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return <div className={cx("px-4 pt-4 md:p-8 mx-auto w-full", wide ? "max-w-7xl" : "max-w-5xl", className)}>{children}</div>;
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5 md:mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-[#6b7280] mt-1 leading-relaxed">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx("min-w-0 bg-white rounded-3xl border border-[#e8eaee]/70 shadow-[var(--shadow)]", onClick && "cursor-pointer hover:shadow-md transition-shadow", className)}>
      {children}
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "dark" | "light" | "ghost" | "danger"; size?: "sm" | "md" };

export function Button({ variant = "dark", size = "md", className, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
        size === "md" ? "min-h-11 px-4 rounded-2xl text-sm" : "min-h-9 px-3 rounded-xl text-[13px]",
        variant === "dark" && "bg-[#1a1d24] text-white hover:opacity-90",
        variant === "light" && "bg-white text-[#1a1d24] border border-[#e8eaee] hover:bg-[#fafbfc]",
        variant === "ghost" && "text-[#6b7280] hover:bg-white hover:text-[#1a1d24]",
        variant === "danger" && "bg-[#fee2e2] text-[#b91c1c] hover:bg-[#fecaca]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "gray", className }: { children: React.ReactNode; tone?: "gray" | "green" | "amber" | "red" | "blue" | "purple" | "dark"; className?: string }) {
  const tones = {
    gray: "bg-[#f4f5f7] text-[#6b7280]",
    green: "bg-[#d1fae5] text-[#047857]",
    amber: "bg-[#fef3c7] text-[#b45309]",
    red: "bg-[#fee2e2] text-[#b91c1c]",
    blue: "bg-[#dbeafe] text-[#1d4ed8]",
    purple: "bg-[#ede9fe] text-[#6d28d9]",
    dark: "bg-[#1a1d24] text-white",
  };
  return <span className={cx("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function statusTone(s: string): "gray" | "green" | "amber" | "red" | "blue" | "purple" {
  if (s === "done") return "green";
  if (s === "running") return "blue";
  if (s === "review") return "purple";
  if (s === "blocked") return "amber";
  if (s === "failed" || s === "archived") return "red";
  return "gray";
}

export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <div className="rounded-xl flex items-center justify-center text-white font-semibold shrink-0 ring-1 ring-white/50" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="font-medium">{title}</p>
      {sub && <p className="text-sm text-[#6b7280] mt-1 max-w-sm mx-auto leading-relaxed">{sub}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2 text-sm bg-[#fee2e2] text-[#991b1b] rounded-2xl px-3 py-2.5 mb-4">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}

export function RunsOffNote({ on }: { on: boolean | undefined }) {
  if (on !== false) return null;
  return (
    <Link href="/settings" className="flex items-center gap-2 text-sm bg-[#fef3c7] text-[#92400e] rounded-2xl px-3 py-2.5 mb-4">
      <Power size={16} className="shrink-0" />
      <span className="min-w-0">Agent runs are off, so nothing is sent to a model yet. Turn them on in Settings once your models are connected.</span>
    </Link>
  );
}

// Bottom sheet on phones, right-side drawer on desktop.
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 bg-black/25 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            className="sheet fixed z-[61] bg-white flex flex-col shadow-2xl"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="md:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-[#e5e7eb]" />
            <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 md:pt-5 border-b border-[#f0f1f3]">
              <div className="font-semibold min-w-0 truncate">{title}</div>
              <button onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 rounded-xl flex items-center justify-center text-[#6b7280] hover:bg-[#f4f5f7]">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer && <div className="border-t border-[#f0f1f3] px-5 py-3 safe-bottom">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("flex gap-1 p-1 bg-white/70 border border-[#e8eaee]/70 rounded-2xl overflow-x-auto no-scrollbar", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cx("min-h-9 px-3 rounded-xl text-[13px] font-medium whitespace-nowrap transition flex items-center gap-1.5 shrink-0", value === o.id ? "bg-[#1a1d24] text-white" : "text-[#6b7280] hover:text-[#1a1d24]")}
        >
          {o.label}
          {o.count !== undefined && <span className={cx("text-[11px]", value === o.id ? "text-white/70" : "text-[#9ca3af]")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-[#6b7280] mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-[#9ca3af] mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full bg-[#fafbfc] border border-[#e8eaee] rounded-2xl px-3.5 py-2.5 text-base md:text-sm outline-none focus:border-[#1a1d24]/30 focus:bg-white placeholder:text-[#9ca3af]";
