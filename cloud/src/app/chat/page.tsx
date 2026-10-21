"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Users, Bot, Cpu, Crown, Loader2 } from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/client";
import { ChatView, Composer, type Who } from "@/components/chat/ChatView";
import { GroupEditor } from "@/components/chat/GroupEditor";
import { Avatar, Badge, Button, ErrorNote, RunsOffNote, Sheet, cx } from "@/components/ui";

type Agent = { id: string; name: string; short: string; color: string; isHead: boolean; description: string };
type Group = { id: string; name: string; members: string[]; lead: string };
type Bridge = { id: string; name: string; provider: string; ready: boolean; note: string };
type ThreadRow = { id: string; title: string; target: { kind: "agent" | "group" | "model"; id: string }; count: number; last: string; updatedAt: number };
type Meta = { threads: ThreadRow[]; groups: Group[]; agents: Agent[]; bridges: Bridge[]; settings: { agentRuns: boolean; headAgent: string } };
type Target = { kind: "agent" | "group" | "model"; id: string };

const modelColors: Record<string, string> = { claude: "#d97757", codex: "#10a37f", openrouter: "#6366f1", muse: "#0866ff", manus: "#111827" };

function ChatInner() {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = params.get("t");
  const { data, error, reload } = useApi<Meta>("/api/chat");
  const [picked, setTarget] = useState<Target | null>(null);
  const [tab, setTab] = useState<"agents" | "groups" | "models">("agents");
  const [groupOpen, setGroupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const target: Target | null = picked ?? (data ? { kind: "agent", id: data.settings.headAgent } : null);
  useEffect(() => {
    if (params.get("new")) router.replace("/chat");
  }, [params, router]);

  const who: Who = {
    ...Object.fromEntries((data?.agents ?? []).map((a) => [a.id, { name: a.name, color: a.color }])),
    ...Object.fromEntries((data?.bridges ?? []).map((b) => [b.id, { name: b.name, color: modelColors[b.id] ?? "#6b7280" }])),
  };
  const label = (t: Target | null) => {
    if (!t || !data) return "";
    if (t.kind === "agent") return data.agents.find((a) => a.id === t.id)?.short ?? t.id;
    if (t.kind === "group") return data.groups.find((g) => g.id === t.id)?.name ?? "Group";
    return data.bridges.find((b) => b.id === t.id)?.name ?? t.id;
  };
  const open = data?.threads.find((t) => t.id === threadId);

  const start = async (text: string) => {
    if (!target) return;
    setBusy(true);
    setMsg(null);
    try {
      const t = await api<{ id: string }>("/api/chat", { method: "POST", json: { target } });
      // The conversation view sends this first message itself, so the reply streams in there.
      try {
        sessionStorage.setItem(`hermes.say.${t.id}`, text);
      } catch {}
      router.push(`/chat?t=${t.id}`);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await api(`/api/chat/${id}`, { method: "DELETE" });
    if (id === threadId) router.push("/chat");
    reload();
  };

  const list = (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3">
        <Button className="w-full" onClick={() => router.push("/chat")}>
          <Plus size={16} /> New chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {data?.threads.length === 0 && <p className="text-xs text-[#9ca3af] px-3 py-6 text-center">No conversations yet.</p>}
        {data?.threads.map((t) => (
          <div key={t.id} className={cx("group flex items-center gap-2 rounded-2xl px-3 py-2.5 cursor-pointer", t.id === threadId ? "bg-white shadow-sm" : "hover:bg-white/70")} onClick={() => router.push(`/chat?t=${t.id}`)}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{t.title}</p>
              <p className="text-[11px] text-[#9ca3af] truncate">
                {label(t.target)} · {timeAgo(t.updatedAt)}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                remove(t.id);
              }}
              aria-label="Delete conversation"
              className="w-9 h-9 rounded-xl items-center justify-center text-[#9ca3af] hover:text-[#b91c1c] hidden group-hover:flex"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const picker = data && (
    <div className="max-w-2xl mx-auto w-full">
      <div className="flex gap-1 p-1 bg-white/70 border border-[#e8eaee]/70 rounded-2xl mb-3 w-fit mx-auto">
        {(
          [
            ["agents", "Agents", Bot],
            ["groups", "Groups", Users],
            ["models", "Models", Cpu],
          ] as const
        ).map(([id, l, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={cx("min-h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5", tab === id ? "bg-[#1a1d24] text-white" : "text-[#6b7280]")}>
            <Icon size={14} /> {l}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {tab === "agents" &&
          data.agents.map((a) => {
            const on = target?.kind === "agent" && target.id === a.id;
            return (
              <button key={a.id} onClick={() => setTarget({ kind: "agent", id: a.id })} className={cx("flex items-center gap-2 min-h-10 pl-1.5 pr-3 rounded-2xl border text-sm", on ? "bg-[#1a1d24] text-white border-[#1a1d24]" : "bg-white border-[#e8eaee]")}>
                <Avatar name={a.short} color={a.color} size={26} />
                {a.short}
                {a.isHead && <Crown size={13} className={on ? "text-amber-300" : "text-amber-500"} />}
              </button>
            );
          })}
        {tab === "groups" && (
          <>
            {data.groups.map((g) => {
              const on = target?.kind === "group" && target.id === g.id;
              return (
                <button key={g.id} onClick={() => setTarget({ kind: "group", id: g.id })} className={cx("flex items-center gap-2 min-h-10 px-3 rounded-2xl border text-sm", on ? "bg-[#1a1d24] text-white border-[#1a1d24]" : "bg-white border-[#e8eaee]")}>
                  <Users size={15} /> {g.name}
                  <span className={cx("text-[11px]", on ? "text-white/60" : "text-[#9ca3af]")}>{g.members.length}</span>
                </button>
              );
            })}
            <button onClick={() => setGroupOpen(true)} className="flex items-center gap-1.5 min-h-10 px-3 rounded-2xl border border-dashed border-[#d1d5db] text-sm text-[#6b7280]">
              <Plus size={15} /> New group
            </button>
          </>
        )}
        {tab === "models" &&
          data.bridges.map((b) => {
            const on = target?.kind === "model" && target.id === b.id;
            return (
              <button key={b.id} onClick={() => setTarget({ kind: "model", id: b.id })} title={b.note} className={cx("flex items-center gap-2 min-h-10 pl-1.5 pr-3 rounded-2xl border text-sm", on ? "bg-[#1a1d24] text-white border-[#1a1d24]" : "bg-white border-[#e8eaee]", !b.ready && !on && "opacity-60")}>
                <Avatar name={b.name} color={modelColors[b.id] ?? "#6b7280"} size={26} />
                {b.name}
                {!b.ready && <Badge tone="amber">setup</Badge>}
              </button>
            );
          })}
      </div>
      {tab === "models" && target?.kind === "model" && <p className="text-xs text-[#9ca3af] text-center mt-3">{data.bridges.find((b) => b.id === target.id)?.note}</p>}
    </div>
  );

  return (
    <div className="screen-h flex min-h-0">
      <aside className="hidden md:block w-72 shrink-0 border-r border-[#e8eaee]/80 bg-white/40">{list}</aside>
      <section className="flex-1 min-w-0 flex flex-col min-h-0">
        {threadId ? (
          <>
            <div className="flex items-center gap-2 px-3 md:px-6 h-14 border-b border-[#e8eaee]/80 bg-white/50 shrink-0">
              <button onClick={() => router.push("/chat")} aria-label="Back" className="md:hidden w-10 h-10 -ml-1 rounded-xl flex items-center justify-center">
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{open?.title ?? "Conversation"}</p>
                <p className="text-[11px] text-[#9ca3af] truncate">{open ? `${open.target.kind === "group" ? "Group" : open.target.kind === "model" ? "Model" : "Agent"}: ${label(open.target)}` : ""}</p>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChatView key={threadId} threadId={threadId} who={who} placeholder={`Message ${label(open?.target ?? null) || "the agent"}...`} onChanged={reload} />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-6 md:py-12">
            <div className="max-w-2xl mx-auto">
              <RunsOffNote on={data?.settings.agentRuns} />
              <ErrorNote text={error || msg} />
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-center mb-1">Who do you want to talk to?</h1>
              <p className="text-sm text-[#6b7280] text-center mb-5">The Operator is your head agent. Pick one agent, a group, or a model.</p>
              {picker ?? <div className="h-28 rounded-3xl bg-white/60 animate-pulse" />}
              <div className="mt-5">
                <Composer onSend={start} busy={busy} placeholder={target ? `Message ${label(target)}...` : "Message..."} autoFocus />
                {busy && (
                  <p className="text-xs text-[#9ca3af] mt-2 flex items-center gap-1.5 justify-center">
                    <Loader2 size={12} className="animate-spin" /> Starting the conversation
                  </p>
                )}
              </div>
              <div className="md:hidden mt-8">
                <p className="text-xs font-medium text-[#6b7280] mb-1 px-1">Recent conversations</p>
                <div className="-mx-2">{list}</div>
              </div>
            </div>
          </div>
        )}
      </section>
      <Sheet open={groupOpen} onClose={() => setGroupOpen(false)} title="New group">
        {data && (
          <GroupEditor
            agents={data.agents}
            onSaved={(g) => {
              setGroupOpen(false);
              setTarget({ kind: "group", id: g.id });
              reload();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatInner />
    </Suspense>
  );
}
