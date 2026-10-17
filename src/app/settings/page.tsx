"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Power } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Card, ErrorNote, Page, PageHeader, cx } from "@/components/ui";

type Data = { settings: { agentRuns: boolean; headAgent: string }; paths: Record<string, string> };

const labels: Record<string, string> = {
  hermesBin: "Hermes",
  board: "Pipeline board",
  agentsDir: "Agent package",
  crmDir: "CRM folder",
  crmUrl: "CRM address",
  vault: "Obsidian vault",
  vaultPipelineFolder: "Shipped projects folder",
  claudeBin: "Claude Code",
  codexBin: "Codex",
};

export default function SettingsPage() {
  const { data, error, setData } = useApi<Data>("/api/settings");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const on = !!data?.settings.agentRuns;

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setData(await api<Data>("/api/settings", { method: "POST", json: { agentRuns: !on } }));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title="Settings" sub="The one switch that lets agents spend money, and where everything lives." />
      <ErrorNote text={error || msg} />
      <Card className="p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className={cx("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", on ? "bg-[#d1fae5] text-[#047857]" : "bg-[#f4f5f7] text-[#6b7280]")}>
            <Power size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Agent runs</p>
            <p className="text-sm text-[#6b7280] mt-1 leading-relaxed">
              {on
                ? "On. Chat messages go to real models, Shape it asks the Operator for a plan, and approved cards start their agents. This uses your OpenRouter credit and subscriptions."
                : "Off. You can capture ideas, write plans, approve them, build workflows and groups. Nothing is sent to a model and no agent starts until you turn this on."}
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={busy || !data}
            role="switch"
            aria-checked={on}
            aria-label="Agent runs"
            className={cx("relative w-14 h-8 rounded-full transition shrink-0", on ? "bg-emerald-500" : "bg-[#d1d5db]")}
          >
            {busy ? <Loader2 size={14} className="animate-spin absolute inset-0 m-auto text-white" /> : <span className={cx("absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all", on ? "left-7" : "left-1")} />}
          </button>
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <p className="font-semibold mb-1">Head agent</p>
        <p className="text-sm text-[#6b7280]">
          {data?.settings.headAgent ?? "rhoperations"} (Executive / Operations Manager). It is the default chat, writes pipeline plans and sums up group chats.
        </p>
      </Card>

      <Card className="p-5 mb-4">
        <p className="font-semibold mb-3">Where things live</p>
        <div className="space-y-2.5">
          {data &&
            Object.entries(labels).map(([k, l]) => (
              <div key={k} className="text-sm">
                <p className="text-xs text-[#9ca3af]">{l}</p>
                <p className="break-all">{data.paths[k]}</p>
              </div>
            ))}
        </div>
        <p className="text-xs text-[#9ca3af] mt-4">Change any of these in .env.local inside the dashboard folder.</p>
      </Card>

      <Link href="/connections" className="block">
        <Card className="p-5 hover:shadow-md transition-shadow">
          <p className="font-semibold">Connections and setup checklist</p>
          <p className="text-sm text-[#6b7280] mt-1">See what is connected and the exact next step for anything that is not.</p>
        </Card>
      </Link>
    </Page>
  );
}
