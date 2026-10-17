"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Plus, Loader2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Button, Card, ErrorNote, Field, Page, PageHeader, Sheet, inputCls } from "@/components/ui";

type Check = { id: string; name: string; group: string; ok: boolean; detail: string; todo?: string };

export default function ConnectionsPage() {
  const { data, error, loading, reload } = useApi<{ checks: Check[] }>("/api/connections");
  const [adding, setAdding] = useState(false);
  const groups = [...new Set((data?.checks ?? []).map((c) => c.group))];
  const ok = data?.checks.filter((c) => c.ok).length ?? 0;

  return (
    <Page>
      <PageHeader
        title="Connections"
        sub="Models, MCP servers, apps and your phone. Green is working. Gray shows the exact next step."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> <span className="hidden sm:inline">Add MCP server</span>
          </Button>
        }
      />
      <ErrorNote text={error} />
      {loading && !data && (
        <p className="text-sm text-[#9ca3af] flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Checking everything. Hermes status takes a few seconds.
        </p>
      )}
      {data && (
        <p className="text-sm text-[#6b7280] mb-4">
          {ok} of {data.checks.length} connected.
        </p>
      )}
      {groups.map((g) => (
        <div key={g} className="mb-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[#9ca3af] mb-2 px-1">{g}</p>
          <Card className="divide-y divide-[#f0f1f3]">
            {data!.checks
              .filter((c) => c.group === g)
              .map((c) => (
                <div key={c.id} className="flex items-start gap-3 p-4">
                  {c.ok ? <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" /> : <Circle size={18} className="text-[#d1d5db] mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-[#6b7280] mt-0.5 break-words">{c.detail}</p>
                    {!c.ok && c.todo && <p className="text-xs text-[#92400e] bg-[#fef3c7] rounded-xl px-2.5 py-1.5 mt-2 break-words">{c.todo}</p>}
                  </div>
                </div>
              ))}
          </Card>
        </div>
      ))}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add an MCP server">
        <McpForm
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      </Sheet>
    </Page>
  );
}

function McpForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <ErrorNote text={msg} />
      <p className="text-sm text-[#6b7280] mb-4">This adds the server to Hermes, so every agent can use its tools. Use a URL for hosted servers, or a command for ones that run on this Mac. Servers that need a login will ask in Hermes the first time.</p>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="github" className={inputCls} />
      </Field>
      <Field label="URL (hosted server)">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" className={inputCls} />
      </Field>
      <p className="text-xs text-[#9ca3af] text-center mb-3">or</p>
      <Field label="Command (local server)">
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" className={inputCls} />
      </Field>
      <Field label="Arguments">
        <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem /path" className={inputCls} />
      </Field>
      <Button
        className="w-full"
        disabled={busy || !name.trim() || (!url.trim() && !command.trim())}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            await api("/api/connections", { method: "POST", json: { name, url: url.trim() || undefined, command: command.trim() || undefined, args } });
            onDone();
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add to Hermes
      </Button>
    </div>
  );
}
