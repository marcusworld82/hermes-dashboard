"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Play, Trash2, Loader2, Sparkles, Check, Clock } from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/client";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Field, Page, PageHeader, RunsOffNote, Sheet, cx, inputCls } from "@/components/ui";

type Agent = { id: string; name: string; short: string; color: string };
type Step = { title: string; agent: string; instructions: string; after: number[] };
type Workflow = { id: string; name: string; description: string; steps: Step[]; schedule: string; runs: { at: number; taskIds: string[]; started: boolean }[] };
type Data = { workflows: Workflow[]; agents: Agent[]; settings: { agentRuns: boolean } };
type Draft = { id?: string; name: string; description: string; schedule: string; steps: Step[] };

// Starting points built from the eight agents' jobs.
const TEMPLATES: Draft[] = [
  {
    name: "Weekly content sprint",
    description: "Plan, write and check a week of posts.",
    schedule: "Every Monday 9am",
    steps: [
      { title: "Pick this week's topics from recent wins and questions", agent: "rhgrowth", instructions: "List 5 topics with the audience and the proof for each.", after: [] },
      { title: "Write hooks, captions and carousel outlines", agent: "rhcreative", instructions: "Follow the Social Media specs in the vault. One carousel, two reels, two singles.", after: [0] },
      { title: "Review against brand and platform specs", agent: "rhquality", instructions: "Check sizes, safe zones, hook formula and the 3-color rule. List fixes.", after: [1] },
    ],
  },
  {
    name: "Lead gen batch",
    description: "Find prospects, research them and draft first messages for approval.",
    schedule: "",
    steps: [
      { title: "Find 20 sourced prospects for the current offer", agent: "rhgrowth", instructions: "Real businesses only, with the observation that makes each a fit.", after: [] },
      { title: "Draft one personal opener per prospect", agent: "rhgrowth", instructions: "No sending. Drafts go to the CRM for Marcus to approve.", after: [0] },
      { title: "Check drafts for tone, facts and opt-out rules", agent: "rhquality", instructions: "Flag any claim without a source.", after: [1] },
    ],
  },
  {
    name: "Client website build",
    description: "Brief to a reviewed first version of a client site.",
    schedule: "",
    steps: [
      { title: "Write the site brief and page list", agent: "rhoperations", instructions: "Goals, pages, must-have content, deadline.", after: [] },
      { title: "Write page copy and pick visuals", agent: "rhcreative", instructions: "Copy for each page in the brief.", after: [0] },
      { title: "Build the first version", agent: "rhtechnical", instructions: "Build from the brief and copy. Share a preview link.", after: [0, 1] },
      { title: "Test on desktop and phone", agent: "rhquality", instructions: "Broken links, layout, speed, forms.", after: [2] },
    ],
  },
];

const empty = (agent: string): Draft => ({ name: "", description: "", schedule: "", steps: [{ title: "", agent, instructions: "", after: [] }] });

function WorkflowsInner() {
  const params = useSearchParams();
  const { data, error, reload } = useApi<Data>("/api/workflows");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const agents = data?.agents ?? [];
  const who = Object.fromEntries(agents.map((a) => [a.id, a]));

  const [dismissedNew, setDismissedNew] = useState(false);
  const shown = draft ?? (params.get("new") && data && !dismissedNew ? empty(data.agents[0]?.id ?? "") : null);
  const close = () => {
    setDraft(null);
    setDismissedNew(true);
  };

  const run = async (w: Workflow) => {
    setBusy(w.id);
    setMsg(null);
    setNote(null);
    try {
      const r = await api<{ taskIds: string[]; started: boolean }>(`/api/workflows/${w.id}`, { method: "POST" });
      setNote(r.started ? `Started. ${r.taskIds.length} cards are on the Kanban.` : `${r.taskIds.length} cards are on the Kanban, paused until agent runs are on.`);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page wide>
      <PageHeader
        title="Workflows"
        sub="Saved jobs your agents run step by step. Each run puts linked cards on the Kanban, so every step waits for the one before it."
        action={
          <Button onClick={() => setDraft(empty(agents[0]?.id ?? ""))}>
            <Plus size={16} /> <span className="hidden sm:inline">New workflow</span>
          </Button>
        }
      />
      <RunsOffNote on={data?.settings.agentRuns} />
      <ErrorNote text={error || msg} />
      {note && <p className="text-sm bg-[#d1fae5] text-[#065f46] rounded-2xl px-3 py-2.5 mb-4">{note}</p>}

      {data?.workflows.length === 0 && (
        <Card className="mb-6">
          <Empty title="No workflows yet" sub="Start from a template below or build one from scratch." />
        </Card>
      )}
      <div className="grid md:grid-cols-2 gap-3 mb-8">
        {data?.workflows.map((w) => (
          <Card key={w.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <button className="text-left min-w-0" onClick={() => setDraft({ id: w.id, name: w.name, description: w.description, schedule: w.schedule, steps: w.steps })}>
                <p className="font-semibold">{w.name}</p>
                {w.description && <p className="text-xs text-[#6b7280] mt-0.5">{w.description}</p>}
              </button>
              <Button size="sm" onClick={() => run(w)} disabled={busy === w.id}>
                {busy === w.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run
              </Button>
            </div>
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {w.steps.map((s, i) => (
                <span key={i} className="flex items-center gap-1 text-[11px] text-[#6b7280]">
                  <Avatar name={who[s.agent]?.short ?? s.agent} color={who[s.agent]?.color ?? "#6b7280"} size={18} />
                  {i < w.steps.length - 1 && <span className="text-[#d1d5db]">→</span>}
                </span>
              ))}
              <span className="text-[11px] text-[#9ca3af] ml-auto">{w.steps.length} steps</span>
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-[#9ca3af]">
              {w.schedule && (
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {w.schedule}
                </span>
              )}
              {w.runs[0] && <span>Last run {timeAgo(w.runs[0].at)}</span>}
            </div>
          </Card>
        ))}
      </div>

      <h2 className="font-semibold mb-3">Templates</h2>
      <div className="grid md:grid-cols-3 gap-3">
        {TEMPLATES.map((t) => (
          <Card key={t.name} className="p-4" onClick={() => setDraft(JSON.parse(JSON.stringify(t)))}>
            <p className="font-medium">{t.name}</p>
            <p className="text-xs text-[#6b7280] mt-0.5">{t.description}</p>
            <p className="text-[11px] text-[#9ca3af] mt-3">{t.steps.length} steps · tap to customize</p>
          </Card>
        ))}
      </div>

      <Sheet open={!!shown} onClose={close} title={shown?.id ? "Edit workflow" : "New workflow"}>
        {shown && (
          <Builder
            key={shown.id ?? shown.name}
            draft={shown}
            agents={agents}
            runsOn={!!data?.settings.agentRuns}
            onSaved={() => {
              close();
              reload();
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}

function Builder({ draft, agents, runsOn, onSaved }: { draft: Draft; agents: Agent[]; runsOn: boolean; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const setStep = (i: number, p: Partial<Step>) => setD((x) => ({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) }));

  const save = async () => {
    setBusy("save");
    setMsg(null);
    try {
      await api("/api/workflows", { method: "POST", json: d });
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!d.id) return;
    await api(`/api/workflows?id=${d.id}`, { method: "DELETE" });
    onSaved();
  };
  const draftIt = async () => {
    setBusy("draft");
    setMsg(null);
    try {
      const w = await api<Draft>("/api/workflows/draft", { method: "POST", json: { description: ask } });
      setD((x) => ({ ...x, name: w.name || x.name, description: w.description || x.description, steps: w.steps?.length ? w.steps.map((s) => ({ ...s, after: s.after ?? [] })) : x.steps }));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <ErrorNote text={msg} />
      <div className="rounded-2xl bg-[#fafbfc] border border-[#e8eaee] p-3 mb-4">
        <p className="text-xs font-medium text-[#6b7280] mb-2">Let the Operator draft it {runsOn ? "" : "(needs agent runs on)"}</p>
        <div className="flex gap-2">
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Every Friday, report on leads and content results" className={inputCls} />
          <Button variant="light" onClick={draftIt} disabled={!ask.trim() || busy === "draft" || !runsOn} aria-label="Draft workflow">
            {busy === "draft" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </Button>
        </div>
      </div>
      <Field label="Name">
        <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={inputCls} />
      </Field>
      <Field label="What it does">
        <input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className={inputCls} />
      </Field>
      <Field label="When it runs" hint="Saved now. Automatic scheduling gets switched on when agent runs are on.">
        <input value={d.schedule} onChange={(e) => setD({ ...d, schedule: e.target.value })} placeholder="Every Monday 9am, or leave blank to run by hand" className={inputCls} />
      </Field>
      {d.steps.map((s, i) => (
        <div key={i} className="rounded-2xl border border-[#e8eaee] p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#9ca3af]">STEP {i + 1}</span>
            {d.steps.length > 1 && (
              <button
                onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i).map((x) => ({ ...x, after: x.after.filter((n) => n !== i).map((n) => (n > i ? n - 1 : n)) })) })}
                aria-label="Remove step"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[#9ca3af] hover:text-[#b91c1c]"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
          <input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Step title" className={cx(inputCls, "mb-2")} />
          <select value={s.agent} onChange={(e) => setStep(i, { agent: e.target.value })} className={cx(inputCls, "mb-2")}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <textarea value={s.instructions} onChange={(e) => setStep(i, { instructions: e.target.value })} rows={2} placeholder="Instructions" className={inputCls} />
          {i > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-[#9ca3af] mr-1 self-center">Waits for:</span>
              {d.steps.slice(0, i).map((_, j) => {
                const on = s.after.includes(j);
                return (
                  <button key={j} onClick={() => setStep(i, { after: on ? s.after.filter((n) => n !== j) : [...s.after, j] })} className={cx("min-h-8 px-2.5 rounded-lg text-xs border", on ? "bg-[#1a1d24] text-white border-[#1a1d24]" : "border-[#e8eaee] text-[#6b7280]")}>
                    Step {j + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setD({ ...d, steps: [...d.steps, { title: "", agent: agents[0]?.id ?? "", instructions: "", after: d.steps.length ? [d.steps.length - 1] : [] }] })}>
        <Plus size={14} /> Add step
      </Button>
      <div className="flex gap-2 mt-4">
        {d.id && (
          <Button variant="danger" onClick={remove}>
            <Trash2 size={16} />
          </Button>
        )}
        <Button className="flex-1" onClick={save} disabled={busy === "save"}>
          {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save workflow
        </Button>
      </div>
      {!runsOn && <Badge className="mt-3">Runs create paused cards until agent runs are on</Badge>}
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <Suspense>
      <WorkflowsInner />
    </Suspense>
  );
}
