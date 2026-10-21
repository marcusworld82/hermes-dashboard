import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.ts";
import { gatewayEvidence } from "./connection-evidence.ts";
import { profileDisplay } from "./profile-display.ts";
import { disabledSkills } from "./profile-skill-policy.ts";

// The roster comes from team.json (built from Marcus's interview, applied to Hermes by
// scripts/build-team.py), joined with the live Hermes profile list (model, gateway status).

export type Agent = {
  id: string; // Hermes profile id, e.g. maya
  name: string; // e.g. Maya
  short: string;
  title: string; // e.g. Social Media Manager
  description: string;
  reportsTo: string | null;
  isHead: boolean;
  isQa: boolean;
  color: string;
  skills: string[];
  knowledge: string[];
  tools: string;
  modelNote: string;
  workflow: string[];
  output: string;
  boundary: string;
  liveModel: string | null;
  gateway: string | null;
  installed: boolean;
  health: { ok: boolean; checkedAt: number; reason: string } | null;
};

type TeamAgent = {
  id: string;
  name: string;
  title: string;
  color: string;
  description: string;
  provider: string;
  model: string;
  fallback: { provider: string; model: string };
  claudeDesk?: string;
  tools: string;
  skills: string[];
  job: string[];
  extraKnowledge?: string[];
};

export type TeamGroup = { name: string; members: string[]; lead: string };
type Team = { head: string; qa?: string; agents: TeamAgent[]; groups: TeamGroup[] };

export function readTeam(): Team {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "team.json"), "utf8")) as Team;
  } catch {
    return { head: "jordan", agents: [], groups: [] };
  }
}

export function headId() {
  return readTeam().head;
}

export function qaId() {
  return readTeam().qa ?? "quinn";
}

// The profile table cuts long model names, so read the profile's own config.
function profileModel(id: string) {
  try {
    const yaml = fs.readFileSync(path.join(paths.hermesHome, "profiles", id, "config.yaml"), "utf8");
    const block = yaml.match(/^model:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1] ?? "";
    return block.match(/^\s+default:\s*"?([^"\n]+)"?/m)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

// Skills Marcus added to this agent: top-level folders with a SKILL.md in the profile's skills
// folder. Hermes's own bundled skills sit in category subfolders and are left out.
export function profileSkills(id: string) {
  const dir = path.join(paths.hermesHome, "profiles", id, "skills");
  try {
    let disabled:string[]=[];
    try {disabled=disabledSkills(fs.readFileSync(path.join(paths.hermesHome,"profiles",id,"config.yaml"),"utf8"));} catch {}
    return fs
      .readdirSync(dir)
      .filter((d) => !disabled.includes(d) && fs.existsSync(path.join(dir, d, "SKILL.md")))
      .sort();
  } catch {
    return [];
  }
}

const providerLabel = (p: string) => (p === "openai-codex" ? "Codex (ChatGPT plan)" : p === "openrouter" ? "OpenRouter" : p);

export async function getAgents(): Promise<Agent[]> {
  const team = readTeam();
  // Profile metadata is already on disk. Full CLI startup is expensive under
  // rendering load, so status reads never launch a Hermes process.
  let state: { pid?: number; kind?: string; gateway_state?: string; served_profiles?: string[] } | null = null;
  try { state = JSON.parse(fs.readFileSync(path.join(paths.hermesHome, "gateway_state.json"), "utf8")); } catch {}
  let alive = false;
  if (Number.isInteger(state?.pid) && state!.pid! > 0) { try { process.kill(state!.pid!, 0); alive = true; } catch {} }
  const gateway = gatewayEvidence(state, alive);
  let health: { checkedAt: number; agents: { id: string; ok: boolean; reason: string }[] } | null = null;
  try { health = JSON.parse(fs.readFileSync(path.join(paths.data, "runtime-health.json"), "utf8")); } catch {}
  return team.agents.map((a) => {
    const display = profileDisplay(a.id);
    const installed = fs.existsSync(path.join(paths.hermesHome, "profiles", a.id, "config.yaml"));
    const running = gateway.running && state?.served_profiles?.includes(a.id);
    const isHead = a.id === team.head;
    return {
      id: a.id,
      name: display.displayName || a.name,
      short: display.displayName || a.name,
      title: a.title,
      description: display.description ?? a.description,
      reportsTo: isHead ? null : team.head,
      isHead,
      isQa: a.id === (team.qa ?? "quinn"),
      color: a.color,
      skills: profileSkills(a.id),
      knowledge: a.extraKnowledge ?? [],
      tools: a.tools,
      modelNote: `${providerLabel(a.provider)}: ${a.model}. Backup: ${a.fallback.model}.${a.claudeDesk ? ` Hands ${a.claudeDesk} to the Claude desk (Claude Code on this Mac).` : ""}`,
      workflow: a.job,
      output: "",
      boundary: "",
      liveModel: profileModel(a.id),
      gateway: running ? "running" : "stopped",
      installed,
      health: (() => { const result = health?.agents.find((row) => row.id === a.id); return result && health ? { ok: result.ok, checkedAt: health.checkedAt, reason: result.reason } : null; })(),
    };
  });
}

export async function getAgent(id: string) {
  const agents = await getAgents();
  const agent = agents.find((a) => a.id === id);
  if (!agent) return null;
  let soul = "";
  try {
    soul = fs.readFileSync(path.join(paths.hermesHome, "profiles", id, "SOUL.md"), "utf8");
  } catch {}
  return { agent, soul, roleGuide: "" };
}

export function rosterForPrompt(agents: Agent[]) {
  return agents
    .filter((a) => a.id !== "nash")
    .map((a) => `- ${a.id} (${a.name}, ${a.title}): ${a.description}`)
    .join("\n");
}
