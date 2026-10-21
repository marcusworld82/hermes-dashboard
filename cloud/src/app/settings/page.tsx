"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Power } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Card, ErrorNote, Page, PageHeader, cx } from "@/components/ui";
import MorningRunSettings from "@/components/MorningRunSettings";

type Data = { settings: { agentRuns: boolean; headAgent: string; obsidianAutoSave: boolean }; paths: Record<string, string> };

const labels: Record<string, string> = {
  hermesBin: "Agent runtime",
  board: "Pipeline board",
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
      <PageHeader title="Settings" sub="Agent access, approved schedules and your workspace." />
      <ErrorNote text={error || msg} />
      <Link href="/settings/gmail"><Card className="p-5 mb-4"><p className="font-semibold">Gmail sender</p><p className="text-sm text-[#6b7280] mt-1">Connect your account, verify a test email and review the queue.</p></Card></Link>
      <Link href="/settings/research"><Card className="p-5 mb-4"><p className="font-semibold">Research and outreach settings</p><p className="text-sm text-[#6b7280] mt-1">Offer, sources, contact details, ranking and daily limits.</p></Card></Link>
      <MorningRunSettings />
      <Card className="p-5 my-4">
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
        <div className="flex justify-between gap-4 items-start"><div><p className="font-semibold">Save shipped projects to Obsidian</p><p className="text-sm text-[var(--text-muted)] mt-1">Optional, off by default. Save each completed project’s title and approved summary in your local vault. Existing shipped projects without a note are included. Existing notes and your edits are preserved. Runs while your Mac is awake.</p></div>
        <input type="checkbox" role="switch" aria-label="Save shipped projects to Obsidian" checked={!!data?.settings.obsidianAutoSave} disabled={busy || !data} onChange={async e => {const enabled=e.target.checked; setBusy(true);setMsg(null);try{setData(await api<Data>("/api/settings",{method:"POST",json:{obsidianAutoSave:enabled}}));}catch(error){setMsg((error as Error).message);}finally{setBusy(false);}}} className="mt-1 h-5 w-5 shrink-0" /></div>
      </Card>

      <Card className="p-5 mb-4">
        <p className="font-semibold mb-1">Head agent</p>
        <p className="text-sm text-[#6b7280]">
          Jordan, your COO ({data?.settings.headAgent ?? "jordan"}). Jordan is the default chat, writes pipeline plans and sums up group chats.
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
