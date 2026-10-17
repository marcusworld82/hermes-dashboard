"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Check, X, Loader2, LayoutGrid, Columns3, Play, ArrowUp, Plus, Trash2, BookOpen, PencilLine } from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/client";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Field, Page, PageHeader, RunsOffNote, Segmented, Sheet, cx, inputCls, statusTone } from "@/components/ui";

type Step = { key: string; title: string; agent: string; instructions: string; dependsOn: string[]; taskId: string | null; status: string; result: string | null };
type Item = {
  id: string;
  title: string;
  idea: string;
  kind: string;
  stage: "capture" | "gate" | "execute" | "shipped";
  plan: { summary: string; kind: string; steps: Omit<Step, "taskId" | "status" | "result">[] } | null;
  planSource: string | null;
  steps: Step[];
  progress: number;
  waitingForRuns: boolean;
  createdAt: number;
  shippedAt: number | null;
  vaultNote: string | null;
};
type Agent = { id: string; name: string; short: string; color: string };

const STAGES = [
  { id: "capture", label: "Capture", sub: "Your ideas, sorted" },
  { id: "gate", label: "Human Gate", sub: "One look before work starts" },
  { id: "execute", label: "Execute", sub: "PM hands out the jobs" },
  { id: "shipped", label: "Shipped", sub: "Finished and filed" },
] as const;

function PipelineInner() {
  const params = useSearchParams();
  const { data, error, reload } = useApi<{ items: Item[]; offline: string | null }>("/api/pipeline", 15_000);
  const { data: team } = useApi<{ agents: Agent[] }>("/api/agents");
  const { data: cfg } = useApi<{ settings: { agentRuns: boolean } }>("/api/settings");
  const [view, setView] = useState<"board" | "gallery">("board");
  const [stage, setStage] = useState<Item["stage"]>("capture");
  const [openId, setOpenId] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const captureRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (params.get("capture")) captureRef.current?.focus();
  }, [params]);

  const items = data?.items ?? [];
  const agents = team?.agents ?? [];
  const who = Object.fromEntries(agents.map((a) => [a.id, a]));
  const open = items.find((i) => i.id === openId) ?? null;

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(`${id}:${action}`);
    setMsg(null);
    try {
      await api(`/api/pipeline/${id}`, { method: "POST", json: { action, ...extra } });
      await reload();
      return true;
    } catch (e) {
      setMsg((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const capture = async () => {
    if (!idea.trim()) return;
    setBusy("capture");
    setMsg(null);
    try {
      await api("/api/pipeline", { method: "POST", json: { idea } });
      setIdea("");
      setStage("capture");
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const counts = Object.fromEntries(STAGES.map((s) => [s.id, items.filter((i) => i.stage === s.id).length]));
  const shipped = items.filter((i) => i.stage === "shipped");

  return (
    <Page wide>
      <PageHeader
        title="From Inbox to Shipped"
        sub="Drop in one idea. The agents shape a plan, you approve once, a project manager and the team build it, and it lands in the gallery and your Obsidian vault."
      />
      <div className="flex items-center justify-between gap-2 mb-4">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { id: "board", label: "Pipeline" },
            { id: "gallery", label: "Gallery", count: shipped.length },
          ]}
        />
        <span className="hidden md:flex items-center gap-1 text-xs text-[#9ca3af]">
          {view === "board" ? <Columns3 size={14} /> : <LayoutGrid size={14} />} Updates every 15 seconds
        </span>
      </div>

      <RunsOffNote on={cfg?.settings.agentRuns} />
      <ErrorNote text={error || msg || (data?.offline ? `Hermes is not answering: ${data.offline}` : null)} />

      <Card className="p-2 mb-5">
        <div className="flex items-end gap-2">
          <Sparkles size={18} className="text-[#9ca3af] ml-3 mb-3.5 shrink-0 hidden sm:block" />
          <textarea
            ref={captureRef}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={1}
            placeholder="Drop an idea in here"
            className="flex-1 resize-none bg-transparent px-3 py-3 text-base md:text-sm outline-none placeholder:text-[#9ca3af] min-w-0"
          />
          <Button onClick={capture} disabled={!idea.trim() || busy === "capture"} className="shrink-0">
            {busy === "capture" ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
            <span className="hidden sm:inline">Capture</span>
          </Button>
        </div>
      </Card>

      {view === "board" ? (
        <>
          <Segmented className="md:hidden mb-3" value={stage} onChange={setStage} options={STAGES.map((s) => ({ id: s.id, label: s.label, count: counts[s.id] }))} />
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {STAGES.map((s, si) => (
              <div key={s.id} className={cx("bg-white/60 rounded-3xl p-3 border border-[#e8eaee]/60 min-w-0", stage !== s.id && "hidden md:block")}>
                <div className="px-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-[#9ca3af]">STAGE {si + 1}</span>
                    <span className="ml-auto text-xs text-[#9ca3af]">{counts[s.id]}</span>
                  </div>
                  <p className="font-semibold">{s.label}</p>
                  <p className="text-xs text-[#9ca3af]">{s.sub}</p>
                </div>
                <div className="space-y-2">
                  {items.filter((i) => i.stage === s.id).length === 0 && <p className="text-xs text-[#9ca3af] text-center py-8">{data ? "Nothing here." : "Loading..."}</p>}
                  {items
                    .filter((i) => i.stage === s.id)
                    .map((i) => (
                      <motion.div key={i.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-3 border border-[#e8eaee] shadow-sm">
                        <button onClick={() => setOpenId(i.id)} className="text-left w-full">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Badge tone="purple">{i.kind}</Badge>
                            <span className="text-[11px] text-[#9ca3af] ml-auto">{timeAgo(i.createdAt)}</span>
                          </div>
                          <p className="text-sm font-medium leading-snug">{i.title}</p>
                        </button>
                        {i.stage === "capture" && (
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" className="flex-1" onClick={() => act(i.id, "shape")} disabled={busy === `${i.id}:shape`}>
                              {busy === `${i.id}:shape` ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Shape it
                            </Button>
                            <Button size="sm" variant="light" onClick={() => setOpenId(i.id)} aria-label="Write the plan myself">
                              <PencilLine size={14} />
                            </Button>
                          </div>
                        )}
                        {i.stage === "gate" && (
                          <div className="mt-3">
                            <p className="text-xs text-[#6b7280] line-clamp-2 mb-2">{i.plan?.summary}</p>
                            <div className="flex -space-x-1.5 mb-3">
                              {[...new Set(i.plan?.steps.map((st) => st.agent))].map((a) => (
                                <Avatar key={a} name={who[a]?.short ?? a} color={who[a]?.color ?? "#6b7280"} size={22} />
                              ))}
                            </div>
                            <Button size="sm" className="w-full" onClick={() => setOpenId(i.id)}>
                              Review plan
                            </Button>
                          </div>
                        )}
                        {i.stage === "execute" && (
                          <div className="mt-3">
                            <div className="h-1.5 bg-[#f0f1f3] rounded-full overflow-hidden">
                              <div className="h-full bg-[#1a1d24] rounded-full transition-all" style={{ width: `${i.progress}%` }} />
                            </div>
                            <p className="text-[11px] text-[#9ca3af] mt-1.5">
                              {i.steps.filter((x) => x.status === "done").length} of {i.steps.length} steps done
                              {i.waitingForRuns && " · waiting for agent runs"}
                            </p>
                            {i.waitingForRuns && (
                              <Button size="sm" variant="light" className="w-full mt-2" onClick={() => act(i.id, "start")} disabled={busy === `${i.id}:start`}>
                                <Play size={14} /> Start the agents
                              </Button>
                            )}
                          </div>
                        )}
                        {i.stage === "shipped" && (
                          <Button size="sm" variant="light" className="w-full mt-3" onClick={() => setOpenId(i.id)}>
                            View what was built
                          </Button>
                        )}
                      </motion.div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : shipped.length === 0 ? (
        <Card>
          <Empty title="Nothing shipped yet" sub="Finished work shows up here with what each agent delivered. Every shipped project is also written to your Obsidian vault." />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shipped.map((i) => (
            <Card key={i.id} className="p-4" onClick={() => setOpenId(i.id)}>
              <div className="flex items-center gap-2 mb-2">
                <Badge tone="green">Shipped</Badge>
                <Badge tone="purple">{i.kind}</Badge>
              </div>
              <p className="font-medium">{i.title}</p>
              <p className="text-xs text-[#6b7280] mt-1 line-clamp-3">{i.steps.find((s) => s.result)?.result ?? i.plan?.summary}</p>
              <p className="text-[11px] text-[#9ca3af] mt-3">{timeAgo(i.shippedAt)}</p>
            </Card>
          ))}
        </div>
      )}

      <Detail key={openId ?? "none"} item={open} agents={agents} onClose={() => setOpenId(null)} act={act} busy={busy} />
    </Page>
  );
}

function Detail({ item, agents, onClose, act, busy }: { item: Item | null; agents: Agent[]; onClose: () => void; act: (id: string, a: string, e?: Record<string, unknown>) => Promise<boolean>; busy: string | null }) {
  const [editing, setEditing] = useState(false);
  const who = Object.fromEntries(agents.map((a) => [a.id, a]));
  if (!item) return null;
  const canPlan = item.stage === "capture" || item.stage === "gate";

  const footer =
    item.stage === "gate" && !editing ? (
      <div className="flex gap-2">
        <Button variant="danger" onClick={async () => (await act(item.id, "reject")) && onClose()} disabled={!!busy}>
          <X size={16} /> Reject
        </Button>
        <Button className="flex-1" onClick={() => act(item.id, "approve")} disabled={!!busy}>
          {busy === `${item.id}:approve` ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Approve and build
        </Button>
      </div>
    ) : item.stage === "capture" && !editing ? (
      <div className="flex gap-2">
        <Button variant="light" onClick={() => setEditing(true)}>
          <PencilLine size={16} /> Write plan
        </Button>
        <Button className="flex-1" onClick={() => act(item.id, "shape")} disabled={!!busy}>
          {busy === `${item.id}:shape` ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Let the agents shape it
        </Button>
      </div>
    ) : undefined;

  return (
    <Sheet open={!!item} onClose={onClose} title={item.title} footer={footer}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge tone="purple">{item.kind}</Badge>
        <Badge>{STAGES.find((s) => s.id === item.stage)?.label}</Badge>
        <span className="text-xs text-[#9ca3af]">Hermes card {item.id}</span>
      </div>
      <p className="text-xs font-medium text-[#6b7280] mb-1">The idea</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap mb-5">{item.idea}</p>

      {editing ? (
        <PlanEditor
          agents={agents}
          initial={item.plan}
          onCancel={() => setEditing(false)}
          onSave={async (plan) => {
            if (await act(item.id, "plan", { plan })) setEditing(false);
          }}
          saving={busy === `${item.id}:plan`}
        />
      ) : item.plan ? (
        <>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-[#6b7280]">The plan {item.planSource === "manual" ? "(written by you)" : "(from the Operator)"}</p>
            {canPlan && (
              <button onClick={() => setEditing(true)} className="text-xs text-[#6b7280] hover:text-[#1a1d24] flex items-center gap-1">
                <PencilLine size={12} /> Edit
              </button>
            )}
          </div>
          <p className="text-sm leading-relaxed mb-4">{item.plan.summary}</p>
          <p className="text-xs font-medium text-[#6b7280] mb-2">Who builds it</p>
          <div className="space-y-2">
            {(item.steps.length ? item.steps : item.plan.steps.map((s) => ({ ...s, taskId: null, status: "planned", result: null }))).map((s, idx) => {
              const a = who[s.agent];
              return (
                <div key={s.key} className="rounded-2xl border border-[#e8eaee] p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={a?.short ?? s.agent} color={a?.color ?? "#6b7280"} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">
                        {s.key === "qc" ? "" : `${idx + 1}. `}
                        {s.title}
                      </p>
                      <p className="text-[11px] text-[#9ca3af]">
                        {a?.name ?? s.agent}
                        {s.dependsOn.length > 0 && ` · after step ${s.dependsOn.map((d) => d.slice(1)).join(", ")}`}
                      </p>
                    </div>
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  </div>
                  {s.instructions && <p className="text-xs text-[#6b7280] mt-2 leading-relaxed">{s.instructions}</p>}
                  {s.result && <p className="text-xs mt-2 bg-[#f0fdf4] text-[#166534] rounded-xl px-2.5 py-2 whitespace-pre-wrap">{s.result}</p>}
                </div>
              );
            })}
          </div>
          {item.stage === "gate" && <p className="text-xs text-[#9ca3af] mt-3">Approving adds a Quality Control check at the end. Nothing starts until agent runs are on.</p>}
        </>
      ) : (
        <div className="rounded-2xl bg-[#fafbfc] border border-dashed border-[#e8eaee] p-4 text-sm text-[#6b7280]">
          No plan yet. Let the agents shape it, or write the steps yourself.
        </div>
      )}

      {item.vaultNote && (
        <p className="mt-5 flex items-center gap-2 text-xs text-[#6b7280]">
          <BookOpen size={14} /> Logged to Obsidian: {item.vaultNote}
        </p>
      )}
    </Sheet>
  );
}

type DraftStep = { title: string; agent: string; instructions: string; dependsOn: string[] };

function PlanEditor({ agents, initial, onSave, onCancel, saving }: { agents: Agent[]; initial: Item["plan"]; onSave: (p: unknown) => void; onCancel: () => void; saving: boolean }) {
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [steps, setSteps] = useState<DraftStep[]>(initial?.steps.map((s) => ({ title: s.title, agent: s.agent, instructions: s.instructions, dependsOn: s.dependsOn })) ?? [{ title: "", agent: agents[0]?.id ?? "", instructions: "", dependsOn: [] }]);
  const set = (i: number, p: Partial<DraftStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div>
      <Field label="What this is and how we will do it">
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={inputCls} />
      </Field>
      {steps.map((s, i) => (
        <div key={i} className="rounded-2xl border border-[#e8eaee] p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#9ca3af]">STEP {i + 1}</span>
            {steps.length > 1 && (
              <button onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} aria-label="Remove step" className="w-9 h-9 -mr-1 rounded-xl flex items-center justify-center text-[#9ca3af] hover:text-[#b91c1c]">
                <Trash2 size={15} />
              </button>
            )}
          </div>
          <input value={s.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Step title" className={cx(inputCls, "mb-2")} />
          <select value={s.agent} onChange={(e) => set(i, { agent: e.target.value })} className={cx(inputCls, "mb-2")}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <textarea value={s.instructions} onChange={(e) => set(i, { instructions: e.target.value })} rows={2} placeholder="What this agent must do and deliver" className={inputCls} />
          {i > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-[#9ca3af] mr-1 self-center">Waits for:</span>
              {steps.slice(0, i).map((_, j) => {
                const key = `s${j + 1}`;
                const on = s.dependsOn.includes(key);
                return (
                  <button key={key} onClick={() => set(i, { dependsOn: on ? s.dependsOn.filter((d) => d !== key) : [...s.dependsOn, key] })} className={cx("min-h-8 px-2.5 rounded-lg text-xs border", on ? "bg-[#1a1d24] text-white border-[#1a1d24]" : "border-[#e8eaee] text-[#6b7280]")}>
                    Step {j + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setSteps((s) => [...s, { title: "", agent: agents[0]?.id ?? "", instructions: "", dependsOn: [] }])}>
        <Plus size={14} /> Add step
      </Button>
      <div className="flex gap-2 mt-4">
        <Button variant="light" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={() => onSave({ summary, steps })} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save plan
        </Button>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense>
      <PipelineInner />
    </Suspense>
  );
}
