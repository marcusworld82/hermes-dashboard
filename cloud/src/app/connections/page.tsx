"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Plus, Loader2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Button, Card, ErrorNote, Field, Page, PageHeader, Sheet, inputCls } from "@/components/ui";

type Check = { id: string; name: string; group: string; ok: boolean; detail: string; todo?: string; probe?: string };

export default function ConnectionsPage() {
  const { data, error, loading, reload } = useApi<{ checks: Check[] }>("/api/connections");
  const [checking, setChecking] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ estimatedMaxCost: number; model: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const groups = [...new Set((data?.checks ?? []).map((c) => c.group))];
  const ok = data?.checks.filter((c) => c.ok).length ?? 0;

  async function check(id: string) {
    setChecking(id); setCheckError(null);
    try {
      if (id === "openrouter" && !quote) {
        setQuote(await api("/api/connections/check"));
      } else {
        await api("/api/connections/check", { method: "POST", json: { id, approvedCost: quote?.estimatedMaxCost } });
        if (id === "openrouter") setQuote(null);
        reload();
      }
    } catch (error) { setCheckError((error as Error).message); setQuote(null); }
    finally { setChecking(null); }
  }
  return (
    <Page>
      <PageHeader
        title="Connections"
        sub="Models, MCP servers, apps and your phone. Each row distinguishes current process checks, saved test results and configuration."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> <span className="hidden sm:inline">Add MCP server</span>
          </Button>
        }
      />
      <ErrorNote text={error || checkError} />
      {loading && !data && (
        <p className="text-sm text-[#9ca3af] flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Checking local process status and saved verification results.
        </p>
      )}
      {data && (
        <p className="text-sm text-[#6b7280] mb-4">
          {ok} of {data.checks.length} checks passed. Configuration rows do not prove authenticated access.
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
                    {c.id === "composio-mcp" && <Link href="/settings/gmail" className="inline-block underline text-sm mt-2">Open Composio connection</Link>}
                    <p className="text-xs text-[#6b7280] mt-0.5 break-words">{c.detail}</p>
                    {c.probe && <div className="mt-2">
                      {c.probe === "openrouter" && quote && <p className="text-xs mb-2">{quote.model}, up to 8 output tokens. Estimated maximum: ${quote.estimatedMaxCost.toFixed(8)}. This next click spends money.</p>}
                      <Button disabled={checking !== null} onClick={() => check(c.probe!)}>
                        {checking === c.probe ? "Checking..." : c.probe === "openrouter" ? quote ? "Approve cost and run a live check" : "Run a live check: show cost" : "Run read-only check"}
                      </Button>
                    </div>}
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
      <p className="text-sm text-[#6b7280] mb-4">This adds the server to Marcus OS, so every agent can use its tools. Use a URL for hosted servers, or a command for ones that run on this Mac. Servers that need a login will ask in Marcus OS the first time.</p>
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
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add to Marcus OS
      </Button>
    </div>
  );
}
