import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import { listProfiles, type Profile } from "./hermes";

// Agent roster comes from the Lazy Money Agents package (roles, skills, workflows)
// joined with the live Hermes profile list (model, gateway status).

export type Agent = {
  id: string; // Hermes profile id, e.g. rhgrowth
  packageId: string; // package folder id, e.g. rh-growth
  name: string;
  short: string;
  description: string;
  reportsTo: string | null;
  isHead: boolean;
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

type ManifestRole = {
  id: string;
  title: string;
  description: string;
  reports_to?: string;
  skills?: string[];
  knowledge?: string[];
  tools?: string;
  model?: string;
  workflow?: string[] | string;
  output?: string | string[];
  boundary?: string | string[];
};

const HEAD = "rh-operations";

const short: Record<string, string> = {
  "rh-operations": "Operator",
  "rh-growth": "Growth",
  "rh-creative": "Creative",
  "rh-technical": "Builder",
  "rh-quality": "Quality",
  "rh-finance": "Finance",
  "personal-trading": "Trading",
  "treasure-manager": "Treasure",
};

const colors: Record<string, string> = {
  "rh-operations": "#1a1d24",
  "rh-growth": "#10b981",
  "rh-creative": "#8b5cf6",
  "rh-technical": "#3b82f6",
  "rh-quality": "#f59e0b",
  "rh-finance": "#0ea5e9",
  "personal-trading": "#ef4444",
  "treasure-manager": "#ec4899",
};

const text = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(" ") : v ?? "");

export function hermesIdFor(packageId: string) {
  return packageId.replace(/-/g, "");
}

function readManifest(): ManifestRole[] {
  try {
    const file = path.join(paths.agentsDir, "03-Sources-and-Skills/agent-manifest.json");
    return (JSON.parse(fs.readFileSync(file, "utf8")).roles ?? []) as ManifestRole[];
  } catch {
    return [];
  }
}

function displayName(packageId: string, fallback: string) {
  try {
    const yaml = fs.readFileSync(path.join(paths.agentsDir, "02-Agents", packageId, "profile.yaml"), "utf8");
    const m = yaml.match(/^display_name:\s*"?(.+?)"?\s*$/m);
    return m ? m[1] : fallback;
  } catch {
    return fallback;
  }
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

export async function getAgents(): Promise<Agent[]> {
  const roles = readManifest();
  const profiles = await cachedProfiles();
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return roles.map((r) => {
    const id = hermesIdFor(r.id);
    const live = byId.get(id);
    const workflow = Array.isArray(r.workflow) ? r.workflow : r.workflow ? [r.workflow] : [];
    return {
      id,
      packageId: r.id,
      name: displayName(r.id, r.title),
      short: short[r.id] ?? r.title.split(" ")[0],
      description: r.description,
      reportsTo: r.id === HEAD ? null : hermesIdFor(r.reports_to ?? HEAD),
      isHead: r.id === HEAD,
      color: colors[r.id] ?? "#6b7280",
      skills: r.skills ?? [],
      knowledge: r.knowledge ?? [],
      tools: r.tools ?? "",
      modelNote: r.model ?? "",
      workflow,
      output: text(r.output),
      boundary: text(r.boundary),
      liveModel: profileModel(id) ?? live?.model ?? null,
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
  let roleGuide = "";
  try {
    soul = fs.readFileSync(path.join(paths.hermesHome, "profiles", id, "SOUL.md"), "utf8");
  } catch {
    try {
      soul = fs.readFileSync(path.join(paths.agentsDir, "02-Agents", agent.packageId, "SOUL.md"), "utf8");
    } catch {}
  }
  try {
    roleGuide = fs.readFileSync(path.join(paths.agentsDir, "02-Agents", agent.packageId, "ROLE-GUIDE.md"), "utf8");
  } catch {}
  return { agent, soul, roleGuide };
}

export function rosterForPrompt(agents: Agent[]) {
  return agents
    .filter((a) => a.id !== "personaltrading")
    .map((a) => `- ${a.id} (${a.name}): ${a.description}`)
    .join("\n");
}
