"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, MessageSquare, Pause, Play, Archive, Plus, Check } from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/client";
import { Avatar, Badge, Button, ErrorNote, Page, PageHeader, Segmented, Sheet, cx, inputCls, statusTone } from "@/components/ui";

type Task = { id: string; title: string; body: string | null; assignee: string | null; status: string; created_at: number; result: string | null; last_failure_error: string | null };
type Detail = {
  task: Task;
  latest_summary: string | null;
  parents: string[];
  children: string[];
  comments: { author: string; body: string; created_at: number }[];
  events: { kind: string; created_at?: number }[];
  runs: Record<string, unknown>[];
};
type Board = { slug: string; name: string };
type Agent = { id: string; name: string; short: string; color: string };

const COLS = [
  { id: "triage", label: "Triage", dot: "bg-slate-400" },
  { id: "todo", label: "To do", dot: "bg-slate-500" },
  { id: "ready", label: "Ready", dot: "bg-sky-500" },
  { id: "running", label: "Running", dot: "bg-blue-500" },
  { id: "review", label: "Review", dot: "bg-violet-500" },
  { id: "blocked", label: "Blocked", dot: "bg-amber-500" },
  { id: "scheduled", label: "Scheduled", dot: "bg-teal-500" },
  { id: "done", label: "Done", dot: "bg-emerald-500" },
];

export default function KanbanPage() {
  const [board, setBoard] = useState("command-center");
  const { data, error, reload } = useApi<{ board: string; boards: Board[]; tasks: Task[] }>(`/api/kanban?board=${encodeURIComponent(board)}`, 15_000);
  const { data: team } = useApi<{ agents: Agent[] }>("/api/agents");
  const [col, setCol] = useState("todo");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const create = async () => {
    setSaving(true); setCreateError(null);
    try {
      const card = await api<Task>("/api/kanban", { method: "POST", json: { title, instructions, assignee, board } });
      setCreating(false); setTitle(""); setInstructions(""); setAssignee(""); reload(); setOpenId(card.id);
    } catch (error) { setCreateError((error as Error).message); } finally { setSaving(false); }
  };
  const who = Object.fromEntries((team?.agents ?? []).map((a) => [a.id, a]));
  const tasks = data?.tasks ?? [];
  const count = (c: string) => tasks.filter((t) => t.status === c).length;

  return (
    <Page wide>
      <PageHeader
        title="Kanban"
        sub="Every card on your Marcus OS boards. Cards with links wait for the cards before them, then start on their own."
        action={
          <select value={board} onChange={(e) => setBoard(e.target.value)} className="min-h-11 bg-white border border-[#e8eaee] rounded-2xl px-3 text-base md:text-sm max-w-[44vw]">
            {(data?.boards ?? [{ slug: board, name: board }]).map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name || b.slug}
              </option>
            ))}
          </select>
        }
      />
      <div className="mb-4"><Button onClick={() => setCreating(true)}><Plus size={16} /> New task</Button></div>
      <ErrorNote text={error} />
      <Sheet open={creating} onClose={() => setCreating(false)} title="New task">
        <ErrorNote text={createError} />
        <div className="space-y-3">
          <input className={inputCls} aria-label="Task title" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <textarea className={inputCls} aria-label="Task instructions" placeholder="Instructions and expected result" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} />
          <select className={inputCls} aria-label="Assign agent" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Unassigned</option>{(team?.agents ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <p className="text-xs text-[#6b7280]">Saved paused. Review the card, then release it to start.</p>
          <Button disabled={!title.trim() || saving} onClick={create}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create task</Button>
        </div>
      </Sheet>
      <Segmented className="md:hidden mb-3" value={col} onChange={setCol} options={COLS.map((c) => ({ id: c.id, label: c.label, count: count(c.id) }))} />
      <div className="md:overflow-x-auto md:pb-3 no-scrollbar">
        <div className="md:flex md:gap-3 md:min-w-max">
          {COLS.map((c) => (
            <div key={c.id} className={cx("md:w-[270px] md:shrink-0 bg-white/60 rounded-3xl p-3 border border-[#e8eaee]/60", col !== c.id && "hidden md:block")}>
              <div className="flex items-center gap-2 px-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <span className="font-medium text-sm">{c.label}</span>
                <span className="ml-auto text-xs text-[#9ca3af]">{count(c.id)}</span>
              </div>
              <div className="space-y-2 min-h-16">
                {tasks
                  .filter((t) => t.status === c.id)
                  .map((t) => {
                    const a = t.assignee ? who[t.assignee] : undefined;
                    return (
                      <motion.button layout key={t.id} onClick={() => setOpenId(t.id)} className="w-full text-left bg-white rounded-2xl p-3 shadow-sm border border-[#e8eaee] hover:shadow-md transition-shadow">
                        <p className="text-sm font-medium leading-snug">{t.title}</p>
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <span className="flex items-center gap-1.5 min-w-0">
                            {t.assignee ? <Avatar name={a?.short ?? t.assignee} color={a?.color ?? "#6b7280"} size={18} /> : null}
                            <span className="text-xs text-[#6b7280] truncate">{a?.short ?? t.assignee ?? "Unassigned"}</span>
                          </span>
                          <span className="text-[11px] text-[#9ca3af] shrink-0">{timeAgo(t.created_at)}</span>
                        </div>
                      </motion.button>
                    );
                  })}
                {count(c.id) === 0 && <p className="text-xs text-[#9ca3af] text-center py-6">Empty</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <TaskSheet id={openId} board={board} who={who} onClose={() => setOpenId(null)} onChanged={reload} />
    </Page>
  );
}

function TaskSheet({ id, board, who, onClose, onChanged }: { id: string | null; board: string; who: Record<string, Agent>; onClose: () => void; onChanged: () => void }) {
  const { data, error, setData } = useApi<Detail>(id ? `/api/kanban/${id}?board=${encodeURIComponent(board)}` : null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!id) return;
    setBusy(action);
    setMsg(null);
    try {
      const d = await api<Detail>(`/api/kanban/${id}?board=${encodeURIComponent(board)}`, { method: "POST", json: { action, ...extra } });
      setData(d);
      onChanged();
      if (action === "comment") setText("");
      if (action === "archive") onClose();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const t = data?.task;
  const a = t?.assignee ? who[t.assignee] : undefined;
  return (
    <Sheet open={!!id} onClose={onClose} title={t?.title ?? "Card"}>
      <ErrorNote text={error || msg} />
      {!t ? (
        <p className="text-sm text-[#9ca3af]">Loading...</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge tone={statusTone(t.status)}>{t.status}</Badge>
            <span className="flex items-center gap-1.5 text-xs text-[#6b7280]">
              {a && <Avatar name={a.short} color={a.color} size={18} />}
              {a?.name ?? t.assignee ?? "Unassigned"}
            </span>
            <span className="text-xs text-[#9ca3af]">{t.id}</span>
          </div>
          {t.body && <p className="text-sm leading-relaxed whitespace-pre-wrap mb-4">{t.body}</p>}
          {t.result && <p className="text-sm bg-[#f0fdf4] text-[#166534] rounded-2xl px-3 py-2.5 mb-4 whitespace-pre-wrap">{t.result}</p>}
          {t.last_failure_error && <p className="text-sm bg-[#fee2e2] text-[#991b1b] rounded-2xl px-3 py-2.5 mb-4">{t.last_failure_error}</p>}

          {(data.parents.length > 0 || data.children.length > 0) && (
            <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
              <div className="rounded-2xl bg-[#fafbfc] border border-[#e8eaee] p-3">
                <p className="text-[#9ca3af] mb-1">Waits for</p>
                {data.parents.length ? data.parents.map((p) => <p key={p}>{p}</p>) : <p className="text-[#9ca3af]">Nothing</p>}
              </div>
              <div className="rounded-2xl bg-[#fafbfc] border border-[#e8eaee] p-3">
                <p className="text-[#9ca3af] mb-1">Then unlocks</p>
                {data.children.length ? data.children.map((p) => <p key={p}>{p}</p>) : <p className="text-[#9ca3af]">Nothing</p>}
              </div>
            </div>
          )}

          <label className="block text-xs text-[#6b7280] mb-4">Assigned agent
            <select className={cx(inputCls, "mt-1")} aria-label="Assigned agent" value={t.assignee ?? ""} disabled={!!busy || t.status === "running" || t.status === "done"} onChange={(e) => { if (e.target.value) void act("assign", { profile: e.target.value }); }}><option value="">Unassigned</option>{Object.values(who).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
          </label>
          <div className="flex flex-wrap gap-2 mb-5">
            {t.status === "blocked" ? (
              <Button size="sm" variant="light" onClick={() => act("unblock")} disabled={!!busy}>
                <Play size={14} /> Release
              </Button>
            ) : t.status !== "done" ? (
              <Button size="sm" variant="light" onClick={() => act("block")} disabled={!!busy}>
                <Pause size={14} /> Pause
              </Button>
            ) : null}
            {t.status !== "done" && <Button size="sm" variant="light" onClick={() => act("complete", { text })} disabled={!!busy || !text.trim()}><Check size={14} /> Mark done with result below</Button>}
            <Button size="sm" variant="ghost" onClick={() => act("archive")} disabled={!!busy}>
              <Archive size={14} /> Archive
            </Button>
          </div>

          <p className="text-xs font-medium text-[#6b7280] mb-2">Comments</p>
          <div className="space-y-2 mb-3">
            {data.comments.length === 0 && <p className="text-xs text-[#9ca3af]">No comments yet.</p>}
            {data.comments.map((c, i) => (
              <div key={i} className="rounded-2xl bg-[#fafbfc] border border-[#e8eaee] px-3 py-2">
                <p className="text-[11px] text-[#9ca3af]">
                  {who[c.author]?.name ?? c.author} · {timeAgo(c.created_at)}
                </p>
                <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-5">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment or completion result" className={inputCls} />
            <Button onClick={() => act("comment", { text })} disabled={!text.trim() || !!busy} aria-label="Add comment">
              {busy === "comment" ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
            </Button>
          </div>

          <p className="text-xs font-medium text-[#6b7280] mb-2">History</p>
          <div className="space-y-1 text-xs text-[#6b7280]">
            {data.events.slice(-12).map((e, i) => (
              <p key={i}>
                {e.kind.replace(/_/g, " ")}
                {e.created_at ? ` · ${timeAgo(e.created_at)}` : ""}
              </p>
            ))}
            <p className="text-[#9ca3af]">{data.runs.length} agent runs</p>
          </div>
        </>
      )}
    </Sheet>
  );
}
