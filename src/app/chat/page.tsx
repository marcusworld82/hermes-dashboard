"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ChevronDown, Sparkles } from "lucide-react";

const models = [
  { id: "claude", name: "Claude", provider: "Anthropic" },
  { id: "codex", name: "Codex", provider: "OpenAI" },
  { id: "grok", name: "Grok", provider: "xAI" },
  { id: "sonar", name: "Sonar", provider: "Perplexity" },
  { id: "manus", name: "Manus", provider: "Manus" },
];

type Message = { role: "user" | "assistant"; content: string; model?: string };

export default function ChatPage() {
  const [model, setModel] = useState(models[0]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Placeholder response from ${model.name}. Wire this to Hermes / OpenRouter / Kie when the backend is ready.`,
          model: model.name,
        },
      ]);
    }, 600);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] md:h-screen bg-[#f4f5f7]">
      {/* Model switcher */}
      <div className="flex items-center justify-center py-4">
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-[#e8eaee] text-sm font-medium hover:shadow transition"
          >
            <Sparkles size={14} />
            {model.name}
            <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-white rounded-2xl shadow-lg border border-[#e8eaee] py-1 z-20"
              >
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setModel(m);
                      setOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#f4f5f7] flex items-center justify-between"
                  >
                    <span>{m.name}</span>
                    <span className="text-xs text-[#9ca3af]">{m.provider}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-0">
        <div className="max-w-2xl mx-auto space-y-6 pb-4">
          {messages.length === 0 && (
            <div className="text-center pt-24 md:pt-32">
              <h2 className="text-2xl font-semibold tracking-tight">What can I help with?</h2>
              <p className="text-sm text-[#6b7280] mt-2">
                Switch models above. Messages stay in this session.
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#1a1d24] text-white"
                    : "bg-white border border-[#e8eaee] shadow-sm"
                }`}
              >
                {msg.role === "assistant" && msg.model && (
                  <p className="text-[10px] text-[#9ca3af] mb-1">{msg.model}</p>
                )}
                {msg.content}
              </div>
            </motion.div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-4 md:pb-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-sm border border-[#e8eaee] flex items-end gap-2 p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Message..."
              rows={1}
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[#9ca3af] max-h-32"
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-2xl bg-[#1a1d24] text-white flex items-center justify-center disabled:opacity-30 hover:opacity-90 active:scale-95 transition"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
