"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { api } from "@/lib/client";
import { ChatView, type Who } from "../chat/ChatView";
import { Sheet } from "../ui";

type ChatMeta = { agents: { id: string; name: string; short: string; color: string; isHead: boolean }[]; settings: { headAgent: string } };

// Floating button on every page: a quick conversation with the head agent.
export function QuickChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [who, setWho] = useState<Who>({});
  const [head, setHead] = useState("Operator");
  const [headShort, setHeadShort] = useState("Operator");

  useEffect(() => {
    if (!open || threadId) return;
    (async () => {
      const meta = await api<ChatMeta>("/api/chat");
      setWho(Object.fromEntries(meta.agents.map((a) => [a.id, { name: a.name, color: a.color }])));
      const h = meta.agents.find((a) => a.id === meta.settings.headAgent);
      if (h) {
        setHead(h.name);
        setHeadShort(h.short);
      }
      let id: string | null = null;
      try {
        id = localStorage.getItem("hermes.quickThread");
        if (id) await api(`/api/chat/${id}`);
      } catch {
        id = null;
      }
      if (!id) {
        const t = await api<{ id: string }>("/api/chat", { method: "POST", json: { target: { kind: "agent", id: meta.settings.headAgent }, title: "Quick chat" } });
        id = t.id;
        try {
          localStorage.setItem("hermes.quickThread", id);
        } catch {}
      }
      setThreadId(id);
    })().catch(() => {});
  }, [open, threadId]);

  if (pathname.startsWith("/chat") || pathname.startsWith("/crm")) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick chat with the head agent"
        className="fixed z-40 right-4 md:right-6 bottom-[calc(var(--tabbar-h)+var(--safe-b)+14px)] md:bottom-6 h-12 pl-4 pr-5 rounded-full bg-[#1a1d24] text-white shadow-xl flex items-center gap-2 text-sm font-medium active:scale-95 transition"
      >
        <MessageCircle size={18} /> Ask {headShort}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Quick chat with ${head}`}>
        <div className="-mx-5 -my-4 h-[70dvh] md:h-[calc(100dvh-110px)]">
          {threadId ? <ChatView threadId={threadId} who={who} placeholder="Ask the head agent..." /> : <p className="p-5 text-sm text-[#9ca3af]">Opening...</p>}
        </div>
      </Sheet>
    </>
  );
}
