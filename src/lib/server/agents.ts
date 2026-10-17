import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import { listProfiles, type Profile } from "./hermes";

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

// "hermes profile list" takes about two seconds, so keep it for 30 seconds.
let profileCache: { at: number; rows: Profile[] } | null = null;
async function cachedProfiles() {
  if (profileCache && Date.now() - profileCache.at < 30_000) return profileCache.rows;
  try {
    profileCache = { at: Date.now(), rows: await listProfiles() };
  } catch {
    return profileCache?.rows ?? [];
  }
  return profileCache.rows;
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
    return fs
      .readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, "SKILL.md")))
      .sort();
  } catch {
    return [];
  }
}

const providerLabel = (p: string) => (p === "openai-codex" ? "Codex (ChatGPT plan)" : p === "openrouter" ? "OpenRouter" : p);

export async function getAgents(): Promise<Agent[]> {
  const team = readTeam();
  const profiles = await cachedProfiles();
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return team.agents.map((a) => {
    const live = byId.get(a.id);
    const isHead = a.id === team.head;
    return {
      id: a.id,
      name: a.name,
      short: a.name,
      title: a.title,
      description: a.description,
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
      liveModel: profileModel(a.id) ?? live?.model ?? null,
      gateway: live?.gateway ?? null,
      installed: !!live,
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
