"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Avatar, Button, ErrorNote, Field, cx, inputCls } from "../ui";

type Agent = { id: string; name: string; short: string; color: string; isHead?: boolean };
type Group = { id: string; name: string; members: string[]; lead: string };

export function GroupEditor({ agents, initial, onSaved }: { agents: Agent[]; initial?: Group; onSaved: (g: Group) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [members, setMembers] = useState<string[]>(initial?.members ?? []);
  const [lead, setLead] = useState(initial?.lead ?? agents.find((a) => a.isHead)?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      onSaved(await api<Group>("/api/groups", { method: "POST", json: { id: initial?.id, name, members, lead } }));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ErrorNote text={msg} />
      <Field label="Group name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Content Team" className={inputCls} />
      </Field>
      <p className="text-xs font-medium text-[#6b7280] mb-1.5">Members</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {agents.map((a) => {
          const on = members.includes(a.id);
          return (
            <button key={a.id} onClick={() => toggle(a.id)} className={cx("flex items-center gap-2 min-h-12 px-2.5 rounded-2xl border text-left text-sm", on ? "border-[#1a1d24] bg-[#1a1d24] text-white" : "border-[#e8eaee] bg-[#fafbfc]")}>
              <Avatar name={a.short} color={a.color} size={26} />
              <span className="truncate flex-1">{a.short}</span>
              {on && <Check size={14} />}
            </button>
          );
        })}
      </div>
      {members.length > 0 && (
        <Field label="Lead (sums up the answers)">
          <select value={members.includes(lead) ? lead : members[0]} onChange={(e) => setLead(e.target.value)} className={inputCls}>
            {members.map((m) => (
              <option key={m} value={m}>
                {agents.find((a) => a.id === m)?.name ?? m}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Button className="w-full" onClick={save} disabled={busy || !name.trim() || members.length < 2}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save group
      </Button>
    </div>
  );
}
