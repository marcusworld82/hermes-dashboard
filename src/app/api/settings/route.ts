import { handle, body } from "@/lib/server/http";
import { getSettings, saveSettings } from "@/lib/server/settings";
import { readJson } from "@/lib/server/store";
import { paths } from "@/lib/server/paths";

export async function GET() {
  return handle(() => ({ settings: getSettings(), paths, obsidian: readJson("obsidian-export-status", {checkedAt:null,errors:[]}) }));
}

export async function POST(req: Request) {
  const b = await body<{ agentRuns?: boolean; headAgent?: string; obsidianAutoSave?: boolean }>(req);
  return handle(() => {
    const patch: { agentRuns?: boolean; headAgent?: string; obsidianAutoSave?: boolean } = {};
    if (typeof b.obsidianAutoSave === "boolean") patch.obsidianAutoSave = b.obsidianAutoSave;
    if (typeof b.agentRuns === "boolean") patch.agentRuns = b.agentRuns;
    if (typeof b.headAgent === "string" && /^[a-z0-9_-]{1,40}$/.test(b.headAgent)) patch.headAgent = b.headAgent;
    return { settings: saveSettings(patch), paths };
  });
}
