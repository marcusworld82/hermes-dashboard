import { handle } from "@/lib/server/http";
import { getAgents } from "@/lib/server/agents";
import { listPipeline } from "@/lib/server/pipeline";
import { boardStats } from "@/lib/server/hermes";
import { talkCounts } from "@/lib/server/chat";
import { getSettings } from "@/lib/server/settings";

export async function GET() {
  return handle(async () => {
    const [agents, pipeline] = await Promise.all([getAgents(), listPipeline()]);
    let stats: Awaited<ReturnType<typeof boardStats>> | null = null;
    try {
      stats = await boardStats();
    } catch {}
    const stages = { capture: 0, gate: 0, execute: 0, shipped: 0 } as Record<string, number>;
    for (const i of pipeline.items) stages[i.stage] = (stages[i.stage] ?? 0) + 1;
    return {
      settings: getSettings(),
      offline: pipeline.offline,
      stages,
      recent: pipeline.items.slice(0, 6),
      agents,
      tasksByAgent: stats?.by_assignee ?? {},
      tasksByStatus: stats?.by_status ?? {},
      talk: talkCounts(),
    };
  });
}
