"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ArrowUpRight, Globe, LineChart, GitBranch, PenTool, Loader2 } from "lucide-react";
import { api, timeAgo, useApi } from "@/lib/client";
import { Avatar, Badge, Card, ErrorNote, Page, RunsOffNote } from "@/components/ui";

type Agent = { id: string; name: string; short: string; color: string; description: string; gateway: string | null; installed: boolean; isHead: boolean };
type Item = { id: string; title: string; kind: string; stage: string; progress: number; createdAt: number };
type Overview = {
  settings: { agentRuns: boolean };
  offline: string | null;
  stages: Record<string, number>;
  recent: Item[];
  agents: Agent[];
  talk: Record<string, number>;
  tasksByAgent: Record<string, unknown>;
};

const starters = [
  { icon: Globe, title: "Build a site", sub: "Landing page, blog or client site", text: "Build a landing page for " },
  { icon: LineChart, title: "Research", sub: "Find, compare and report back", text: "Research and report on " },
  { icon: GitBranch, title: "Automate", sub: "A workflow the team runs for you", href: "/workflows?new=1" },
  { icon: PenTool, title: "Create content", sub: "Carousel, reel or caption set", text: "Create a carousel about " },
];

const stageLabel: Record<string, string> = { capture: "Captured", gate: "Needs approval", execute: "Building", shipped: "Shipped" };

// Reads the clock, so it renders at request time inside its own Suspense boundary.
function Greeting() {
  const now = new Date();
  const h = now.getHours();
  return (
    <>
      <p className="text-sm text-[#6b7280]">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-1 mb-5">{h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}, Marcus</h1>
    </>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data, error, reload } = useApi<Overview>("/api/overview", 20_000);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const capture = async () => {
    if (!idea.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/pipeline", { method: "POST", json: { idea } });
      setIdea("");
      router.push("/pipeline");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const talk = data ? Object.entries(data.talk).sort((a, b) => b[1] - a[1]) : [];
  const top = talk[0] ? data?.agents.find((a) => a.id === talk[0][0]) : undefined;

  return (
    <Page wide>
      <Suspense fallback={<div className="h-[76px]" />}>
        <Greeting />
      </Suspense>

      <RunsOffNote on={data?.settings.agentRuns} />
      <ErrorNote text={error || msg || (data?.offline ? `Hermes is not answering: ${data.offline}` : null)} />

      <Card className="p-3 md:p-4 mb-4">
        <p className="text-center text-lg md:text-xl font-semibold tracking-tight pt-2 pb-3">What are we creating today?</p>
        <div className="flex items-end gap-2 bg-[#fafbfc] border border-[#e8eaee] rounded-3xl p-2">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={2}
            placeholder="Drop in one idea. The agents plan it and wait for your OK."
            className="flex-1 resize-none bg-transparent px-3 py-2 text-base md:text-sm outline-none placeholder:text-[#9ca3af]"
          />
          <button onClick={capture} disabled={!idea.trim() || busy} aria-label="Capture idea" className="w-11 h-11 rounded-2xl bg-[#1a1d24] text-white flex items-center justify-center disabled:opacity-30 shrink-0">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {starters.map((s, i) => {
          const Icon = s.icon;
          const inner = (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="h-full bg-white rounded-3xl border border-[#e8eaee]/70 p-4 hover:shadow-md transition-shadow text-left">
              <span className="w-9 h-9 rounded-xl bg-[#f4f5f7] flex items-center justify-center mb-3">
                <Icon size={17} />
              </span>
              <p className="font-medium text-sm">{s.title}</p>
              <p className="text-xs text-[#6b7280] mt-0.5 leading-snug">{s.sub}</p>
            </motion.div>
          );
          return s.href ? (
            <Link key={s.title} href={s.href}>
              {inner}
            </Link>
          ) : (
            <button key={s.title} onClick={() => setIdea(s.text ?? "")} className="text-left">
              {inner}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {(["capture", "gate", "execute", "shipped"] as const).map((k) => (
          <Link key={k} href="/pipeline">
            <Card className="p-4 md:p-5 hover:shadow-md transition-shadow">
              <p className="text-xs text-[#6b7280]">{stageLabel[k]}</p>
              <p className="text-2xl font-semibold mt-2">{data?.stages[k] ?? "–"}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Agents</h2>
            <Link href="/agents" className="text-sm text-[#6b7280] hover:text-[#1a1d24] flex items-center gap-1">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {data?.agents.map((a) => (
              <Link key={a.id} href={`/agents/${a.id}`} className="rounded-2xl border border-[#e8eaee] p-3 bg-[#fafbfc] hover:bg-white hover:shadow-sm transition-all min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <Avatar name={a.short} color={a.color} size={30} />
                  <span className={`w-2 h-2 rounded-full ${a.gateway === "running" ? "bg-emerald-500" : "bg-[#d1d5db]"}`} />
                </div>
                <p className="font-medium text-sm truncate">{a.short}</p>
                <p className="text-[11px] text-[#9ca3af] truncate">{a.isHead ? "Head agent" : a.gateway === "running" ? "Online" : "Offline"}</p>
              </Link>
            ))}
            {!data && Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-[#f4f5f7] animate-pulse" />)}
          </div>
          {top && (
            <p className="text-xs text-[#6b7280] mt-4">
              You talk to <span className="font-medium text-[#1a1d24]">{top.name}</span> the most ({talk[0][1]} messages).
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">Recent</h2>
            <button onClick={reload} className="text-xs text-[#9ca3af] hover:text-[#1a1d24]">
              Refresh
            </button>
          </div>
          {data?.recent.length === 0 && <p className="text-sm text-[#9ca3af] py-4">Nothing captured yet. Type an idea above.</p>}
          <div className="divide-y divide-[#f0f1f3]">
            {data?.recent.map((r) => (
              <Link key={r.id} href="/pipeline" className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-[#9ca3af]">
                    {r.kind} · {timeAgo(r.createdAt)}
                  </p>
                </div>
                <Badge tone={r.stage === "shipped" ? "green" : r.stage === "gate" ? "amber" : r.stage === "execute" ? "blue" : "gray"}>{stageLabel[r.stage]}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}
