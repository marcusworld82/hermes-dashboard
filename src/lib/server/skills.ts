import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { paths } from "./paths";
import { profileSkills, readTeam } from "./agents";

// Each Hermes agent only sees the skills in its own profile folder
// (~/.hermes/profiles/<agent>/skills). Assigning a skill copies it there; unassigning removes
// that agent's copy, but only when another copy still exists in a library below, so nothing is lost.

const home = os.homedir();
const uploads = () => path.join(paths.data, "skill-uploads");

// Places a skill can be copied from, in order of preference.
function libraries() {
  const dirs = [path.join(home, ".claude/skills"), path.join(paths.hermesHome, "skills"), uploads()];
  const synced = path.join(home, ".claude/skills/synced");
  if (fs.existsSync(synced)) for (const d of fs.readdirSync(synced)) dirs.push(path.join(synced, d));
  const cache = path.join(home, ".claude/plugins/cache");
  if (fs.existsSync(cache)) {
    for (const a of fs.readdirSync(cache))
      for (const b of safeList(path.join(cache, a)))
        for (const c of safeList(path.join(cache, a, b))) dirs.push(path.join(cache, a, b, c, "skills"));
  }
  return dirs.filter((d) => fs.existsSync(d));
}

function safeList(dir: string) {
  try {
    return fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory());
  } catch {
    return [];
  }
}

function skillsIn(dir: string) {
  return safeList(dir).filter((d) => fs.existsSync(path.join(dir, d, "SKILL.md")));
}

function findSource(name: string) {
  for (const lib of libraries()) {
    const p = path.join(lib, name);
    if (fs.existsSync(path.join(p, "SKILL.md"))) return p;
  }
  return null;
}

function safeName(s: string) {
  const n = s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!n) throw new Error("Give the skill a name.");
  return n.slice(0, 60);
}

const profileDir = (agent: string) => path.join(paths.hermesHome, "profiles", agent, "skills");

export async function skillsOverview() {
  const team = readTeam();
  const agents = team.agents.map((a) => ({ id: a.id, name: a.name, short: a.name, color: a.color }));
  const byAgent = new Map(team.agents.map((a) => [a.id, new Set(profileSkills(a.id))]));
  const available = new Set<string>();
  for (const lib of libraries()) for (const s of skillsIn(lib)) available.add(s);
  const names = new Set<string>(available);
  for (const set of byAgent.values()) for (const s of set) names.add(s);
  const pending = skillsIn(uploads());
  const skills = [...names].sort().map((name) => {
    const holders = team.agents.filter((a) => byAgent.get(a.id)?.has(name)).map((a) => a.id);
    return { name, installed: holders.length > 0, source: available.has(name) ? "library" : "agent only", status: null, packageAgents: [] as string[], agents: holders, uploaded: pending.includes(name) };
  });
  return { skills, pending: [] as string[], error: null as string | null, agents };
}

// Saves an uploaded skill folder into the dashboard's library. Assign it to agents afterwards.
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

export function installUpload(name: string) {
  return safeName(name);
}

export function discardUpload(name: string) {
  fs.rmSync(path.join(uploads(), safeName(name)), { recursive: true, force: true });
}

// Gives exactly these agents the skill: copies it to new ones, removes it from the rest.
export function assignSkill(name: string, agents: string[]) {
  const n = safeName(name);
  const team = readTeam();
  const wanted = new Set(agents.filter((a) => team.agents.some((t) => t.id === a)));
  const source = findSource(n) ?? team.agents.map((a) => path.join(profileDir(a.id), n)).find((p) => fs.existsSync(path.join(p, "SKILL.md"))) ?? null;
  if (!source && wanted.size) throw new Error(`No copy of ${n} was found to give out.`);
  const libraryCopy = findSource(n);
  const result: Record<string, "added" | "removed" | "kept"> = {};
  for (const a of team.agents) {
    const dest = path.join(profileDir(a.id), n);
    const has = fs.existsSync(path.join(dest, "SKILL.md"));
    if (wanted.has(a.id) && !has) {
      fs.mkdirSync(profileDir(a.id), { recursive: true });
      fs.cpSync(source!, dest, { recursive: true, dereference: true, filter: (p) => !/(^|\/)(node_modules|\.git|__pycache__|\.DS_Store)(\/|$)/.test(p) });
      result[a.id] = "added";
    } else if (!wanted.has(a.id) && has) {
      // Only remove when a library copy remains, so the skill can always be given back.
      if (libraryCopy && path.resolve(libraryCopy) !== path.resolve(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
        result[a.id] = "removed";
      } else result[a.id] = "kept";
    }
  }
  return result;
}

export function skillsFor(agentId: string) {
  return profileSkills(agentId);
}
