import { handle, body } from "@/lib/server/http";
import { createThread, listGroups, listThreads, type Target } from "@/lib/server/chat";
import { getAgents } from "@/lib/server/agents";
import { listBridges } from "@/lib/server/models";
import { getSettings } from "@/lib/server/settings";

export async function GET() {
  return handle(async () => ({
    threads: listThreads(),
    groups: listGroups(),
    agents: (await getAgents()).map((a) => ({ id: a.id, name: a.name, short: a.short, color: a.color, isHead: a.isHead, description: a.description })),
    bridges: await listBridges(),
    settings: getSettings(),
  }));
}

export async function POST(req: Request) {
  const b = await body<{ target?: Target; title?: string }>(req);
  return handle(async () => {
    const t = b.target;
    if (!t || !["agent", "group", "model"].includes(t.kind) || !t.id) throw new Error("Pick who to talk to.");
    if (t.kind === "agent" && !(await getAgents()).some((a) => a.id === t.id && a.installed)) throw new Error("Choose an installed agent.");
    if (t.kind === "group" && !listGroups().some((g) => g.id === t.id)) throw new Error("Choose an existing group.");
    if (t.kind === "model" && !(await listBridges()).some((m) => m.id === t.id && m.ready)) throw new Error("Choose a connected model.");
    return createThread(t, b.title);
  }, 201);
}
