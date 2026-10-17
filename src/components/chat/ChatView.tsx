"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Loader2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Avatar, cx } from "../ui";

export type ChatMessage = { id: string; role: "user" | "agent" | "system"; author: string; text: string; at: number; error?: boolean };
export type ChatThread = { id: string; title: string; target: { kind: string; id: string }; messages: ChatMessage[] };
export type Who = Record<string, { name: string; color: string }>;

export function Bubble({ m, who }: { m: ChatMessage; who: Who }) {
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg px-4 py-2.5 text-[15px] md:text-sm leading-relaxed bg-[#1a1d24] text-white whitespace-pre-wrap break-words">{m.text}</div>
      </div>
    );
  if (m.role === "system")
    return (
      <div className={cx("mx-auto max-w-[92%] text-center text-xs rounded-2xl px-3 py-2", m.error ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#f4f5f7] text-[#6b7280]")}>{m.text}</div>
    );
  const w = who[m.author] ?? { name: m.author, color: "#6b7280" };
  return (
    <div className="flex gap-2.5 items-start">
      <Avatar name={w.name} color={w.color} size={28} />
      <div className="min-w-0 max-w-[85%]">
        <p className="text-[11px] text-[#9ca3af] mb-1">{w.name}</p>
        <div className="rounded-3xl rounded-tl-lg px-4 py-2.5 text-[15px] md:text-sm leading-relaxed bg-white border border-[#e8eaee] shadow-sm whitespace-pre-wrap break-words">{m.text}</div>
      </div>
    </div>
  );
}

export function Composer({ onSend, busy, placeholder, autoFocus }: { onSend: (t: string) => void; busy: boolean; placeholder: string; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);
  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text.trim());
    setText("");
  };
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-[#e8eaee] flex items-end gap-2 p-2">
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-transparent px-3 py-2.5 text-base md:text-sm outline-none placeholder:text-[#9ca3af]"
      />
      <button onClick={submit} disabled={!text.trim() || busy} aria-label="Send" className="w-11 h-11 rounded-2xl bg-[#1a1d24] text-white flex items-center justify-center disabled:opacity-30 active:scale-95 transition shrink-0">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
      </button>
    </div>
  );
}

// A full conversation: messages that scroll, composer pinned at the bottom.
export function ChatView({ threadId, who, placeholder, onChanged }: { threadId: string; who: Who; placeholder: string; onChanged?: () => void }) {
  const { data, setData } = useApi<ChatThread>(`/api/chat/${threadId}`);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data?.messages.length, pending]);

  useEffect(() => {
    let first: string | null = null;
    try {
      first = sessionStorage.getItem(`hermes.say.${threadId}`);
      sessionStorage.removeItem(`hermes.say.${threadId}`);
    } catch {}
    if (first) send(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const send = async (text: string) => {
    setBusy(true);
    setPending(text);
    try {
      const t = await api<ChatThread>(`/api/chat/${threadId}`, { method: "POST", json: { text } });
      setData(t);
      onChanged?.();
    } catch (e) {
      setData((d) => (d ? { ...d, messages: [...d.messages, { id: `err${Date.now()}`, role: "system", author: "dashboard", text: (e as Error).message, at: Date.now() / 1000, error: true }] } : d));
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 md:px-6 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {data?.messages.length === 0 && !pending && <p className="text-center text-sm text-[#9ca3af] pt-10">Say what you need. Plain words are fine.</p>}
          {data?.messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <Bubble m={m} who={who} />
            </motion.div>
          ))}
          {pending && (
            <>
              <Bubble m={{ id: "p", role: "user", author: "marcus", text: pending, at: 0 }} who={who} />
              <div className="flex items-center gap-2 text-xs text-[#9ca3af] pl-1">
                <Loader2 size={14} className="animate-spin" /> Working on it. Agents can take a minute.
              </div>
            </>
          )}
          <div ref={end} />
        </div>
      </div>
      <div className="px-3 md:px-6 pb-3 md:pb-6 pt-2">
        <div className="max-w-2xl mx-auto">
          <Composer onSend={send} busy={busy} placeholder={placeholder} />
        </div>
      </div>
    </div>
  );
}
