import { readJson, updateJson, newId, now } from "./store";
import { getSettings, requireRuns } from "./settings";
import * as hermes from "./hermes";
import { getAgents, rosterForPrompt } from "./agents";
import { skillsForAgent } from "./skills";

// Saved, repeatable multi-step jobs. Running one creates linked Hermes cards,
// the same way an approved pipeline plan does.

export type WorkflowStep = { title: string; agent: string; instructions: string; after: number[] };
export type Workflow = {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  schedule: string; // plain words, e.g. "Every Monday 9am". Scheduling is turned on later.
  runs: { at: number; taskIds: string[]; started: boolean }[];
  createdAt: number;
  updatedAt: number;
};

type Db = Record<string, Workflow>;

export function listWorkflows() {
  return Object.values(readJson<Db>("workflows", {})).sort((a, b) => b.updatedAt - a.updatedAt);
}

function get(id: string) {
  const w = readJson<Db>("workflows", {})[id];
  if (!w) throw new Error("Workflow not found.");
  return w;
}

export async function saveWorkflow(input: Partial<Workflow> & { name: string; steps: WorkflowStep[] }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Name the workflow.");
  if (!Array.isArray(input.steps) || input.steps.length === 0) throw new Error("Add at least one step.");
  const valid = new Set((await getAgents()).map((a) => a.id));
  const steps = input.steps.map((s, i) => {
    if (!s.title?.trim()) throw new Error(`Step ${i + 1} needs a title.`);
    if (!valid.has(s.agent)) throw new Error(`Step ${i + 1} needs an agent.`);
    return { title: s.title.trim().slice(0, 120), agent: s.agent, instructions: (s.instructions ?? "").slice(0, 4000), after: (s.after ?? []).filter((n) => n >= 0 && n < i) };
  });
  const existing = input.id ? readJson<Db>("workflows", {})[input.id] : undefined;
  const w: Workflow = {
    id: input.id || newId("wf"),
    name,
    description: (input.description ?? "").slice(0, 1000),
    steps,
    schedule: (input.schedule ?? "").slice(0, 120),
    runs: existing?.runs ?? [],
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  };
  updateJson<Db>("workflows", {}, (d) => {
    d[w.id] = w;
  });
  return w;
}

export function deleteWorkflow(id: string) {
  updateJson<Db>("workflows", {}, (d) => {
    delete d[id];
  });
}

export async function runWorkflow(id: string) {
  const w = get(id);
  await hermes.ensureBoard();
  const runs = getSettings().agentRuns;
  const ids: string[] = [];
  for (const [i, s] of w.steps.entries()) {
    const t = await hermes.createTask({
      title: s.title,
      body: `${s.instructions}\n\nWorkflow: ${w.name} (step ${i + 1} of ${w.steps.length})`,
      assignee: s.agent,
      parents: s.after.map((n) => ids[n]).filter(Boolean),
      skills: await skillsForAgent(s.agent),
      blocked: !runs,
    });
    ids.push(t.id);
  }
  updateJson<Db>("workflows", {}, (d) => {
    d[id].runs.unshift({ at: now(), taskIds: ids, started: runs });
    d[id].runs = d[id].runs.slice(0, 20);
  });
  return { taskIds: ids, started: runs };
}

// Asks the head agent to draft a workflow from a plain description.
export async function draftWorkflow(description: string) {
  requireRuns();
  const agents = await getAgents();
  const prompt = [
    "Design a repeatable workflow for Marcus's agent team. Reply with JSON only:",
    '{"name":"short name","description":"one sentence","steps":[{"title":"...","agent":"profile id","instructions":"...","after":[0]}]}',
    "after lists the zero-based indexes of earlier steps that must finish first. 2 to 7 steps. Use only these profile ids:",
    rosterForPrompt(agents),
    "",
    `What the workflow should do: ${description}`,
  ].join("\n");
  const reply = await hermes.askProfile(getSettings().headAgent, prompt);
  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The Operator did not return a workflow. Build it by hand instead.");
  return JSON.parse(m[0]) as { name: string; description: string; steps: WorkflowStep[] };
}
