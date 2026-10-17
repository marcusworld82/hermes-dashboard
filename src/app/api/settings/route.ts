import { handle, body } from "@/lib/server/http";
import { getSettings, saveSettings } from "@/lib/server/settings";
import { paths } from "@/lib/server/paths";

export async function GET() {
  return handle(() => ({ settings: getSettings(), paths }));
}

export async function POST(req: Request) {
  const b = await body<{ agentRuns?: boolean; headAgent?: string }>(req);
  return handle(() => {
    const patch: { agentRuns?: boolean; headAgent?: string } = {};
    if (typeof b.agentRuns === "boolean") patch.agentRuns = b.agentRuns;
    if (typeof b.headAgent === "string" && /^[a-z0-9_-]{1,40}$/.test(b.headAgent)) patch.headAgent = b.headAgent;
    return { settings: saveSettings(patch), paths };
  });
}
