"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/social", label: "Calendar" },
  { href: "/social/carousels", label: "Carousels" },
  { href: "/social/history", label: "History" },
];

// Sub-menu shared by every Social page. Video, Stories and the rest join here later.
export function SocialNav() {
  const path = usePathname();
  return (
    <div className="px-4 pt-4 md:px-8 md:pt-6 mx-auto w-full max-w-7xl">
      <nav className="flex gap-1 p-1 bg-white/70 border border-[#e8eaee]/70 rounded-2xl w-fit overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const on = t.href === "/social" ? path === "/social" : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={cx("min-h-9 px-3.5 rounded-xl text-[13px] font-medium whitespace-nowrap flex items-center", on ? "bg-[#1a1d24] text-white" : "text-[#6b7280] hover:text-[#1a1d24]")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
