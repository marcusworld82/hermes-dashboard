"use client";

import Link from "next/link";
import { useState } from "react";
import { Crown, Plus, Users, Trash2, MessageSquare } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { GroupEditor } from "@/components/chat/GroupEditor";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Page, PageHeader, Sheet } from "@/components/ui";

type Agent = { id: string; name: string; short: string; color: string; description: string; reportsTo: string | null; isHead: boolean; gateway: string | null; liveModel: string | null; installed: boolean; skills: string[] };
type Group = { id: string; name: string; members: string[]; lead: string };
type Data = { agents: Agent[]; talk: Record<string, number>; tasks: Record<string, number>; groups: Group[] };

function AgentCard({ a, talk, tasks }: { a: Agent; talk: number; tasks: number }) {
  return (
    <Link href={`/agents/${a.id}`} className="block bg-white rounded-3xl border border-[#e8eaee]/70 p-4 hover:shadow-md transition-shadow min-w-0">
      <div className="flex items-start gap-3">
        <Avatar name={a.short} color={a.color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold truncate">{a.name}</p>
            {a.isHead && <Crown size={14} className="text-amber-500 shrink-0" />}
          </div>
          <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-2 leading-relaxed">{a.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <Badge tone={a.gateway === "running" ? "green" : "gray"}>{a.gateway === "running" ? "Online" : a.installed ? "Offline" : "Not installed"}</Badge>
        {a.liveModel && <Badge>{a.liveModel.replace(/^[a-z-]+\//, "")}</Badge>}
        <span className="text-[11px] text-[#9ca3af] ml-auto">
          {talk} {talk === 1 ? "message" : "messages"} · {tasks} {tasks === 1 ? "card" : "cards"}
        </span>
      </div>
    </Link>
  );
}

export default function AgentsPage() {
  const { data, error, reload } = useApi<Data>("/api/agents");
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const agents = data?.agents ?? [];
  const head = agents.find((a) => a.isHead);
  const team = agents.filter((a) => !a.isHead);
  const ranked = [...agents].sort((x, y) => (data?.talk[y.id] ?? 0) - (data?.talk[x.id] ?? 0));
  const maxTalk = Math.max(1, ...agents.map((a) => data?.talk[a.id] ?? 0));

  return (
    <Page wide>
      <PageHeader title="Agents" sub="Your eight agents from the Lazy Money Agents package, running in Hermes. Everyone reports to the Operator." />
      <ErrorNote text={error} />

      {head && (
        <div className="max-w-md mx-auto mb-3">
          <AgentCard a={head} talk={data?.talk[head.id] ?? 0} tasks={data?.tasks[head.id] ?? 0} />
        </div>
      )}
      {head && <div className="hidden md:block mx-auto w-px h-6 bg-[#e8eaee]" />}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {team.map((a) => (
          <AgentCard key={a.id} a={a} talk={data?.talk[a.id] ?? 0} tasks={data?.tasks[a.id] ?? 0} />
        ))}
        {!data && Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-32 rounded-3xl bg-white/60 animate-pulse" />)}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="font-semibold text-lg mb-1">Who you talk to most</h2>
          <p className="text-xs text-[#9ca3af] mb-4">Counted from your messages in Chat, including groups.</p>
          <div className="space-y-3">
            {ranked.map((a) => {
              const n = data?.talk[a.id] ?? 0;
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <Avatar name={a.short} color={a.color} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium truncate">{a.short}</span>
                      <span className="text-[#9ca3af]">{n}</span>
                    </div>
                    <div className="h-1.5 bg-[#f0f1f3] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(n / maxTalk) * 100}%`, background: a.color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg">Groups</h2>
              <p className="text-xs text-[#9ca3af]">Talk to several agents at once. The lead sums up.</p>
            </div>
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus size={14} /> New
            </Button>
          </div>
          {data?.groups.length === 0 && <Empty title="No groups yet" sub="Try a Content Team: Creative, Growth and Quality." />}
          <div className="space-y-2">
            {data?.groups.map((g) => (
              <div key={g.id} className="flex items-center gap-3 rounded-2xl border border-[#e8eaee] p-3">
                <Users size={18} className="text-[#6b7280] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{g.name}</p>
                  <div className="flex -space-x-1.5 mt-1">
                    {g.members.map((m) => {
                      const a = agents.find((x) => x.id === m);
                      return <Avatar key={m} name={a?.short ?? m} color={a?.color ?? "#6b7280"} size={20} />;
                    })}
                  </div>
                </div>
                <Link href="/chat" className="w-10 h-10 rounded-xl flex items-center justify-center text-[#6b7280] hover:bg-[#f4f5f7]" aria-label="Chat with group">
                  <MessageSquare size={16} />
                </Link>
                <button onClick={() => setEditing(g)} className="text-xs text-[#6b7280] px-2 min-h-10">
                  Edit
                </button>
                <button
                  onClick={async () => {
                    await api(`/api/groups?id=${g.id}`, { method: "DELETE" });
                    reload();
                  }}
                  aria-label="Delete group"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-[#9ca3af] hover:text-[#b91c1c]"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New group" : "Edit group"}>
        {editing && (
          <GroupEditor
            key={editing === "new" ? "new" : editing.id}
            agents={agents}
            initial={editing === "new" ? undefined : editing}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}
