"use client";

import {BriefIdeas} from "@/components/BriefIdeas";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, Button, Card, Empty, ErrorNote, Field, Page, PageHeader, inputCls } from "@/components/ui";

type Skill = { id: string; label: string; platform: "instagram" | "linkedin" | "research"; publishable: boolean };
type Draft = { id: string; skillId: string; platform: string; brief: string; status: string; output: string; error?: string; createdAt: string; scheduledFor?: string };
type Studio = { skills: Skill[]; drafts: Draft[]; metricool: boolean };
const BASE = "/api/social/studio";
const GROUPS: { platform: Skill["platform"]; title: string }[] = [
  { platform: "instagram", title: "Instagram" },
  { platform: "linkedin", title: "LinkedIn" },
  { platform: "research", title: "Research (public data only)" },
];
const tone = (s: string) => (s === "sent" ? "green" : s === "failed" ? "red" : s === "ready" || s === "approved" ? "blue" : "amber") as "green" | "red" | "blue" | "amber";
const message = (e: unknown) => (e instanceof Error ? e.message : "The request failed. Try again.");

export default function StudioPage() {
  const { data, error, reload } = useApi<Studio>(BASE, 4000);
  const [skillId, setSkillId] = useState("");
  const [brief, setBrief] = useState("");
  const [research, setResearch] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [when, setWhen] = useState<Record<string, string>>({});

  async function act(key: string, json: Record<string, unknown>) {
    setBusy(key); setErr(null);
    try { await api(BASE, { method: "POST", json }); await reload(); return true; } catch (e) { setErr(message(e)); return false; } finally { setBusy(null); }
  }
  const pick = data?.skills.find((s) => s.id === skillId);

  return (
    <Page wide>
      <PageHeader title="Social Studio" sub="Pick a button, write a short brief, review the draft. Nothing is posted until you approve it and press Send." />
      <ErrorNote text={err || error} />
      <Card className="p-4 md:p-5 mb-5">
        {GROUPS.map((g) => (
          <div key={g.platform} className="mb-3">
            <p className="text-xs font-medium text-[#6b7280] mb-1.5">{g.title}</p>
            <div className="flex flex-wrap gap-2">
              {data?.skills.filter((s) => s.platform === g.platform).map((s) => (
                <Button key={s.id} variant={skillId === s.id ? "dark" : "ghost"} size="sm" onClick={() => setSkillId(s.id)}>{s.label}</Button>
              ))}
            </div>
          </div>
        ))}
        <BriefIdeas ideas={["Share one practical lesson from a recent project. Use only facts I provide.","Explain three questions a potential client should ask before using AI.","Draft a behind-the-scenes post about improving a workflow. Ask me for missing facts."]} onChoose={setBrief}/><Field label={pick ? `Brief for: ${pick.platform} ${pick.label}` : "Pick a button first"} hint={pick?.id === "competitors" ? "List the competitor handles or names. Public posts only." : undefined}>
          <textarea className={inputCls} rows={4} maxLength={4000} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="The idea, who it is for, and any link or numbers to use." />
        </Field>
        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} /> Research the last 30 days first
        </label>
        <Button disabled={!skillId || !brief.trim() || busy === "start"} onClick={async () => { if (await act("start", { action: "start", skillId, brief, researchFirst: research })) setBrief(""); }}>
          {busy === "start" ? <Loader2 size={16} className="animate-spin" /> : "Create draft"}
        </Button>
      </Card>

      {!data?.metricool && <p className="text-sm text-[#b45309] mb-4">Metricool is not connected yet. You can draft and approve, but Send is off until the automation link is added.</p>}
      <div className="space-y-3">
        {data && data.drafts.length === 0 && <Card><Empty title="No drafts yet" sub="Your drafts show up here, newest first." /></Card>}
        {data?.drafts.map((d) => {
          const s = data.skills.find((x) => x.id === d.skillId);
          const text = edits[d.id] ?? d.output;
          return (
            <Card key={d.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge tone={tone(d.status)}>{d.status}</Badge>
                <p className="text-sm font-medium">{d.platform} · {s?.label}</p>
                <p className="w-full text-xs text-[#9ca3af] sm:w-auto sm:ml-auto">{new Date(d.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </div>
              <p className="text-xs text-[#6b7280] mb-2 line-clamp-2 break-words">{d.brief}</p>
              {d.status === "drafting" && <p className="text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Writing. This can take up to eight minutes.</p>}
              {d.error && <p className="text-sm text-[#991b1b] mb-2">{d.error}</p>}
              {d.output && (d.status === "ready" ? (
                <textarea aria-label={`Draft: ${d.platform} ${s?.label ?? d.skillId}`} className={inputCls} rows={10} value={text} onChange={(e) => setEdits({ ...edits, [d.id]: e.target.value })} />
              ) : (
                <pre className="whitespace-pre-wrap break-words text-sm bg-[#fafbfc] rounded-2xl p-3 max-h-80 overflow-auto font-sans">{d.output}</pre>
              ))}
              {d.status === "ready" && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {s?.publishable && <input type="datetime-local" className={inputCls + " min-w-0 max-w-full sm:!w-auto"} value={when[d.id] ?? ""} onChange={(e) => setWhen({ ...when, [d.id]: e.target.value })} aria-label="Post time" />}
                  <Button size="sm" disabled={busy === d.id} onClick={async () => { if (edits[d.id] !== undefined && edits[d.id] !== d.output) { const saved = await act(d.id, { action: "edit", id: d.id, output: edits[d.id] }); if (!saved) return; } await act(d.id, { action: "approve", id: d.id, scheduledFor: when[d.id] ? new Date(when[d.id]).toISOString() : undefined }); }}>Approve</Button>
                </div>
              )}
              {d.status === "approved" && s?.publishable && (
                <Button size="sm" className="mt-3" disabled={!data.metricool || busy === d.id} onClick={() => act(d.id, { action: "publish", id: d.id })}>
                  {d.scheduledFor ? "Send to Metricool (scheduled)" : "Send to Metricool"}
                </Button>
              )}
              {d.status === "uncertain" && <p className="text-sm text-[#b45309] mt-2">Check Metricool before sending this again.</p>}
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
