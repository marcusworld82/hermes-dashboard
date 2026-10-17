import { handle } from "@/lib/server/http";
import { getAgents } from "@/lib/server/agents";
import { talkCounts, listGroups } from "@/lib/server/chat";
import { boardStats } from "@/lib/server/hermes";

export async function GET() {
  return handle(async () => {
    const agents = await getAgents();
    let tasks: Record<string, number> = {};
    try {
      const s = await boardStats();
      tasks = Object.fromEntries(Object.entries(s.by_assignee).map(([k, v]) => [k, typeof v === "number" ? v : Object.values(v as Record<string, number>).reduce((a, b) => a + b, 0)]));
    } catch {}
    return { agents, talk: talkCounts(), tasks, groups: listGroups() };
  });
}
