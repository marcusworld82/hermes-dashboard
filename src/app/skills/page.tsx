"use client";

import { useRef, useState } from "react";
import { Upload, Check, Loader2, X, Search } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Avatar, Badge, Button, Card, ErrorNote, Field, Page, PageHeader, Segmented, Sheet, cx, inputCls } from "@/components/ui";

type Agent = { id: string; name: string; short: string; color: string };
type Skill = { name: string; installed: boolean; source: string | null; status: string | null; packageAgents: string[]; agents: string[]; uploaded: boolean };
type Data = { skills: Skill[]; pending: string[]; error: string | null; agents: Agent[] };

export default function SkillsPage() {
  const { data, error, reload } = useApi<Data>("/api/skills");
  const [filter, setFilter] = useState<"all" | "installed" | "missing">("all");
  const [q, setQ] = useState("");
  const [assign, setAssign] = useState<Skill | null>(null);
  const [upload, setUpload] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const agents = data?.agents ?? [];
  const who = Object.fromEntries(agents.map((a) => [a.id, a]));
  const skills = (data?.skills ?? []).filter((s) => (filter === "installed" ? s.installed : filter === "missing" ? !s.installed : true)).filter((s) => s.name.includes(q.toLowerCase()));
  const missing = (data?.skills ?? []).filter((s) => !s.installed && s.packageAgents.length).length;

  const act = async (name: string, action: "install" | "discard") => {
    setMsg(null);
    try {
      await api("/api/skills", { method: "PATCH", json: { action, name } });
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <Page wide>
      <PageHeader
        title="Skills"
        sub="What your agents know how to do. Upload a skill folder, install it into Hermes, then choose which agents use it."
        action={
          <Button onClick={() => setUpload(true)}>
            <Upload size={16} /> <span className="hidden sm:inline">Upload skill</span>
          </Button>
        }
      />
      <ErrorNote text={error || msg || data?.error || null} />
      {missing > 0 && <p className="text-sm bg-[#fef3c7] text-[#92400e] rounded-2xl px-3 py-2.5 mb-4">{missing} skills listed in your agent package are not installed in Hermes yet.</p>}

      {(data?.pending.length ?? 0) > 0 && (
        <Card className="p-4 mb-4">
          <p className="font-medium mb-2">Uploaded, waiting to install</p>
          {data!.pending.map((p) => (
            <div key={p} className="flex items-center gap-2 py-1.5">
              <span className="text-sm flex-1 truncate">{p}</span>
              <Button size="sm" onClick={() => act(p, "install")}>
                <Check size={14} /> Install
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act(p, "discard")} aria-label="Discard">
                <X size={14} />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: data?.skills.length },
            { id: "installed", label: "Installed", count: data?.skills.filter((s) => s.installed).length },
            { id: "missing", label: "Not installed", count: data?.skills.filter((s) => !s.installed).length },
          ]}
        />
        <div className="relative sm:ml-auto sm:w-64">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a skill" className={cx(inputCls, "pl-9")} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {skills.map((s) => (
          <Card key={s.name} className="p-3.5" onClick={() => setAssign(s)}>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate flex-1">{s.name}</p>
              <Badge tone={s.installed ? "green" : "amber"}>{s.installed ? "Installed" : "Not installed"}</Badge>
            </div>
            <div className="flex items-center gap-1 mt-2 min-h-5">
              {s.agents.map((a) => (
                <Avatar key={a} name={who[a]?.short ?? a} color={who[a]?.color ?? "#6b7280"} size={20} />
              ))}
              {s.agents.length === 0 && <span className="text-[11px] text-[#9ca3af]">No agents assigned</span>}
            </div>
          </Card>
        ))}
      </div>

      <Sheet open={!!assign} onClose={() => setAssign(null)} title={assign?.name ?? ""}>
        {assign && <Assign skill={assign} agents={agents} onDone={() => { setAssign(null); reload(); }} />}
      </Sheet>
      <Sheet open={upload} onClose={() => setUpload(false)} title="Upload a skill">
        <UploadForm onDone={() => { setUpload(false); reload(); }} />
      </Sheet>
    </Page>
  );
}

function Assign({ skill, agents, onDone }: { skill: Skill; agents: Agent[]; onDone: () => void }) {
  const [sel, setSel] = useState<string[]>(skill.agents);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p className="text-sm text-[#6b7280] mb-3">
        {skill.installed ? `Installed in Hermes (${skill.source ?? "local"}).` : "Not installed in Hermes yet. Agents can be assigned now and will use it once installed."}
        {skill.packageAgents.length > 0 && ` Your agent package lists it for ${skill.packageAgents.length} agent(s).`}
      </p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {agents.map((a) => {
          const on = sel.includes(a.id);
          return (
            <button key={a.id} onClick={() => setSel((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))} className={cx("flex items-center gap-2 min-h-12 px-2.5 rounded-2xl border text-left text-sm", on ? "border-[#1a1d24] bg-[#1a1d24] text-white" : "border-[#e8eaee] bg-[#fafbfc]")}>
              <Avatar name={a.short} color={a.color} size={26} />
              <span className="truncate flex-1">{a.short}</span>
              {on && <Check size={14} />}
            </button>
          );
        })}
      </div>
      <Button
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await api("/api/skills", { method: "PATCH", json: { action: "assign", name: skill.name, agents: sel } });
          setBusy(false);
          onDone();
        }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save
      </Button>
    </div>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const folder = useRef<HTMLInputElement>(null);

  const pick = (list: FileList | null) => {
    const arr = Array.from(list ?? []);
    setFiles(arr);
    const top = (arr[0] as File & { webkitRelativePath?: string })?.webkitRelativePath?.split("/")[0];
    if (top && !name) setName(top);
  };

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.set("name", name);
      for (const f of files) {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        form.append("files", f, rel);
      }
      const res = await fetch("/api/skills", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ErrorNote text={msg} />
      <p className="text-sm text-[#6b7280] mb-4">A skill is a folder with a SKILL.md file and any helper files. It is saved here first, then you press Install to add it to Hermes.</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <label className="rounded-2xl border border-dashed border-[#d1d5db] p-4 text-center text-sm cursor-pointer hover:bg-[#fafbfc]">
          <input
            ref={folder}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => pick(e.target.files)}
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          />
          Choose folder
        </label>
        <label className="rounded-2xl border border-dashed border-[#d1d5db] p-4 text-center text-sm cursor-pointer hover:bg-[#fafbfc]">
          <input type="file" className="hidden" accept=".md" onChange={(e) => pick(e.target.files)} />
          Just a SKILL.md
        </label>
      </div>
      {files.length > 0 && <p className="text-xs text-[#6b7280] mb-3">{files.length} file(s) selected</p>}
      <Field label="Skill name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="lead-research" className={inputCls} />
      </Field>
      <Button className="w-full" onClick={send} disabled={busy || !files.length || !name.trim()}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload
      </Button>
    </div>
  );
}
