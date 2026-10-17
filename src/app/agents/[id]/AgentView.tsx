"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Crown, MessageSquare, Loader2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Avatar, Badge, Button, Card, ErrorNote, Page } from "@/components/ui";

type Agent = {
  id: string;
  name: string;
  short: string;
  color: string;
  description: string;
  isHead: boolean;
  reportsTo: string | null;
  skills: string[];
  knowledge: string[];
  tools: string;
  modelNote: string;
  workflow: string[];
  output: string;
  boundary: string;
  liveModel: string | null;
  gateway: string | null;
  installed: boolean;
};

export function AgentView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, error } = useApi<{ agent: Agent; soul: string; roleGuide: string; extraSkills: string[] }>(`/api/agents/${id}`);
  const [busy, setBusy] = useState(false);
  const a = data?.agent;

  const talk = async () => {
    setBusy(true);
    try {
      const t = await api<{ id: string }>("/api/chat", { method: "POST", json: { target: { kind: "agent", id } } });
      router.push(`/chat?t=${t.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] mb-4 min-h-10">
        <ArrowLeft size={16} /> Agents
      </Link>
      <ErrorNote text={error} />
      {a && (
        <>
          <div className="flex items-start gap-4 mb-5">
            <Avatar name={a.short} color={a.color} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{a.name}</h1>
                {a.isHead && <Crown size={18} className="text-amber-500" />}
              </div>
              <p className="text-sm text-[#6b7280] mt-1 leading-relaxed">{a.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <Badge tone={a.gateway === "running" ? "green" : "gray"}>{a.gateway === "running" ? "Online" : "Offline"}</Badge>
                <Badge>Hermes id: {a.id}</Badge>
                {a.liveModel && <Badge tone="blue">{a.liveModel}</Badge>}
                <Badge>{a.isHead ? "Head agent" : `Reports to ${a.reportsTo}`}</Badge>
              </div>
            </div>
          </div>
          <Button onClick={talk} disabled={busy} className="w-full sm:w-auto mb-6">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />} Talk to {a.short}
          </Button>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="font-semibold mb-3">How it works</h2>
              <ol className="space-y-2 text-sm text-[#374151] list-decimal pl-5">
                {a.workflow.map((w, i) => (
                  <li key={i} className="leading-relaxed">
                    {w}
                  </li>
                ))}
              </ol>
              {a.output && (
                <>
                  <p className="text-xs font-medium text-[#6b7280] mt-4 mb-1">Delivers</p>
                  <p className="text-sm leading-relaxed">{a.output}</p>
                </>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="font-semibold mb-3">Skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set([...a.skills, ...(data?.extraSkills ?? [])])].map((s) => (
                  <Badge key={s} tone="purple">
                    {s}
                  </Badge>
                ))}
                {a.skills.length === 0 && (data?.extraSkills ?? []).length === 0 && <p className="text-sm text-[#9ca3af]">No skills listed yet.</p>}
              </div>
              <Link href="/skills" className="inline-block text-xs text-[#6b7280] mt-3 underline underline-offset-2">
                Upload or assign skills
              </Link>
              {a.tools && (
                <>
                  <p className="text-xs font-medium text-[#6b7280] mt-5 mb-1">Tools</p>
                  <p className="text-sm leading-relaxed">{a.tools}</p>
                </>
              )}
              {a.modelNote && (
                <>
                  <p className="text-xs font-medium text-[#6b7280] mt-4 mb-1">Model plan</p>
                  <p className="text-sm leading-relaxed">{a.modelNote}</p>
                </>
              )}
            </Card>
            {a.boundary && (
              <Card className="p-5">
                <h2 className="font-semibold mb-2">Limits</h2>
                <p className="text-sm leading-relaxed text-[#374151]">{a.boundary}</p>
              </Card>
            )}
            {a.knowledge.length > 0 && (
              <Card className="p-5">
                <h2 className="font-semibold mb-2">Knowledge it reads</h2>
                <ul className="text-sm space-y-1 text-[#374151]">
                  {a.knowledge.map((k) => (
                    <li key={k} className="truncate">
                      {k}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {data?.soul && (
            <Card className="p-5 mt-4">
              <h2 className="font-semibold mb-2">Instructions (SOUL.md)</h2>
              <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words text-[#374151] max-h-96 overflow-y-auto font-sans">{data.soul}</pre>
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
