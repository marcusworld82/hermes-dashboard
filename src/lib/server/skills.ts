import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import { readJson, updateJson } from "./store";
import { listSkills } from "./hermes";
import { getAgents } from "./agents";

// Skills: what Hermes has installed, what each agent's package expects,
// uploads waiting to be installed, and which agents may use which skill.

const uploads = () => path.join(paths.data, "skill-uploads");

function safeName(s: string) {
  const n = s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!n) throw new Error("Give the skill a name.");
  return n.slice(0, 60);
}

export async function skillsOverview() {
  let installed: Awaited<ReturnType<typeof listSkills>> = [];
  let error: string | null = null;
  try {
    installed = await listSkills();
  } catch (e) {
    error = (e as Error).message;
  }
  const agents = await getAgents();
  const assigned = readJson<Record<string, string[]>>("skill-assignments", {});
  const expected = new Map<string, string[]>();
  for (const a of agents) for (const s of a.skills) expected.set(s, [...(expected.get(s) ?? []), a.id]);
  const names = new Set([...installed.map((s) => s.name), ...expected.keys(), ...Object.keys(assigned)]);
  const installedSet = new Set(installed.map((s) => s.name));
  const pending = fs.existsSync(uploads()) ? fs.readdirSync(uploads()).filter((d) => fs.statSync(path.join(uploads(), d)).isDirectory()) : [];
  const skills = [...names].sort().map((name) => ({
    name,
    installed: installedSet.has(name),
    source: installed.find((s) => s.name === name)?.source ?? null,
    status: installed.find((s) => s.name === name)?.status ?? null,
    packageAgents: expected.get(name) ?? [],
    agents: assigned[name] ?? expected.get(name) ?? [],
    uploaded: pending.includes(name),
  }));
  return { skills, pending, error, agents: agents.map((a) => ({ id: a.id, name: a.name, short: a.short, color: a.color })) };
}

// Saves an uploaded skill folder (files with relative paths) for review before install.
export function saveUpload(name: string, files: { path: string; content: Buffer }[]) {
  const n = safeName(name);
  if (!files.length) throw new Error("Choose a skill folder or a SKILL.md file.");
  if (!files.some((f) => path.basename(f.path).toLowerCase() === "skill.md")) throw new Error("A skill needs a SKILL.md file.");
  const total = files.reduce((s, f) => s + f.content.length, 0);
  if (total > 20 * 1024 * 1024) throw new Error("Skill folders must be under 20 MB.");
  const root = path.join(uploads(), n);
  fs.rmSync(root, { recursive: true, force: true });
  for (const f of files) {
    // Drop the top folder name and refuse anything that climbs out of the skill folder.
    const parts = f.path.split(/[\\/]/).filter(Boolean);
    const rel = parts.length > 1 ? parts.slice(1).join("/") : parts[0];
    const dest = path.resolve(root, rel);
    if (!dest.startsWith(root + path.sep)) throw new Error(`Unsafe file path: ${f.path}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.content);
  }
  return n;
}

// Copies an uploaded skill into Hermes's local skills folder.
export function installUpload(name: string) {
  const n = safeName(name);
  const src = path.join(uploads(), n);
  if (!fs.existsSync(src)) throw new Error("Upload not found.");
  const dest = path.join(paths.hermesHome, "skills", n);
  if (fs.existsSync(dest)) throw new Error(`Hermes already has a skill named ${n}. Rename the upload or remove the old one first.`);
  fs.cpSync(src, dest, { recursive: true });
  fs.rmSync(src, { recursive: true, force: true });
  return n;
}

export function discardUpload(name: string) {
  fs.rmSync(path.join(uploads(), safeName(name)), { recursive: true, force: true });
}

export function assignSkill(name: string, agents: string[]) {
  return updateJson<Record<string, string[]>>("skill-assignments", {}, (d) => {
    d[name] = [...new Set(agents)];
  });
}

// Skills to force-load on an agent's cards: what you assigned on the Skills page,
// or the agent package's list when you have not assigned anything yet. Only
// skills Hermes actually has installed are passed, so a card never fails to start.
export async function skillsForAgent(agentId: string) {
  const assigned = readJson<Record<string, string[]>>("skill-assignments", {});
  const agent = (await getAgents()).find((a) => a.id === agentId);
  const names = new Set<string>();
  for (const s of agent?.skills ?? []) if (!(s in assigned)) names.add(s);
  for (const [s, agents] of Object.entries(assigned)) if (agents.includes(agentId)) names.add(s);
  let installed: Set<string>;
  try {
    installed = new Set((await listSkills()).filter((s) => s.status !== "disabled").map((s) => s.name));
  } catch {
    return [];
  }
  return [...names].filter((n) => installed.has(n));
}

export function skillsFor(agentId: string) {
  const assigned = readJson<Record<string, string[]>>("skill-assignments", {});
  return Object.entries(assigned)
    .filter(([, a]) => a.includes(agentId))
    .map(([n]) => n);
}
