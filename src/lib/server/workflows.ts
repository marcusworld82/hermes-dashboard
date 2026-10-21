import { workflowDispatchIndexes, validateWorkflowGate } from "./workflow-gates.ts";
import { dueSlot, validateSchedule, type WorkflowSchedule } from "./workflow-schedule.ts";
import { readJson, updateJson, newId, now } from "./store.ts";
import { getSettings, requireRuns } from "./settings.ts";
import * as hermes from "./hermes.ts";
import { getAgents, rosterForPrompt } from "./agents.ts";

// Saved, repeatable multi-step jobs. Running one creates linked Hermes cards,
// the same way an approved pipeline plan does.

export type WorkflowStep = { title: string; agent: string; instructions: string; after: number[]; humanGate?: boolean };
export type Workflow = {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  schedule: string; // Legacy timing notes never activate a schedule.
  scheduleRule?: WorkflowSchedule;
  lastScheduleSlot?: string;
  runs: { at: number; taskIds: string[]; started: boolean; scheduleSlot?: string; approvedGates?: number[]; gateResults?: Record<string, string> }[];
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
    return { humanGate: s.humanGate === true, title: s.title.trim().slice(0, 120), agent: s.agent, instructions: (s.instructions ?? "").slice(0, 4000), after: (s.after ?? []).filter((n) => n >= 0 && n < i) };
  });
  const existing = input.id ? readJson<Db>("workflows", {})[input.id] : undefined;
  if (existing?.runs.length && JSON.stringify(existing.steps.map(step => [step.title,step.agent,step.instructions,step.after,step.humanGate === true])) !== JSON.stringify(steps.map(step => [step.title,step.agent,step.instructions,step.after,step.humanGate === true]))) throw Error("Create a new workflow to change steps after a run. Existing gate approvals belong to their original steps.");
  const w: Workflow = {
    id: input.id || newId("wf"),
    name,
    description: (input.description ?? "").slice(0, 1000),
    steps,
    schedule: (input.schedule ?? "").slice(0, 120),
    scheduleRule: input.scheduleRule ? validateSchedule(input.scheduleRule) : existing?.scheduleRule,
    lastScheduleSlot: existing?.lastScheduleSlot,
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

const runningWorkflows = new Set<string>();

export async function runWorkflow(id: string, slot?: string) {
  if (runningWorkflows.has(id)) throw new Error("This workflow is already starting.");
  runningWorkflows.add(id);
  try { return await createRun(id, slot); } finally { runningWorkflows.delete(id); }
}

async function createRun(id: string, slot?: string) {
  const w = get(id);
  await hermes.ensureBoard();
  const runs = getSettings().agentRuns;
  const ids: string[] = [];
  for (const [i, s] of w.steps.entries()) {
    const t = await hermes.createTask({
      idempotencyKey: slot ? `workflow:${id}:${slot}:${i}` : undefined,
      title: s.title,
      body: `${s.humanGate ? "[HERMES_HUMAN_GATE]\n" : w.steps.some(step => step.humanGate) ? "[HERMES_GATED_WORKFLOW]\n" : ""}${s.instructions}\n\nWorkflow: ${w.name} (step ${i + 1} of ${w.steps.length})`,
      assignee: s.agent,
      parents: s.after.map((n) => ids[n]).filter(Boolean),
      blocked: true,
    });
    ids.push(t.id);
  }
  updateJson<Db>("workflows", {}, (d) => {
    d[id].runs.unshift({ at: now(), taskIds: ids, started: false, scheduleSlot: slot });
    d[id].runs = d[id].runs.slice(0, 20);
    if (slot) d[id].lastScheduleSlot = slot;
  });
  if (runs) {
    for (const index of workflowDispatchIndexes(w.steps)) {
      const taskId = ids[index];
      // Graph creation can take time. The current switch, not the earlier snapshot,
      // controls every dispatch. Keep the saved run paused if it changed.
      if (!getSettings().agentRuns || slot && !get(id).scheduleRule?.enabled) return { taskIds: ids, started: false };
      await hermes.unblockTask(taskId, undefined, {workflowApproved:true});
    }
    updateJson<Db>("workflows", {}, (d) => { const saved = d[id].runs.find((r) => r.taskIds[0] === ids[0]); if (saved) saved.started = !w.steps.some(step => step.humanGate); });
  }
  return { taskIds: ids, started: runs && !w.steps.some(step => step.humanGate), waitingForHuman: w.steps.some(step => step.humanGate) };
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

// Resume the existing paused cards instead of duplicating a run.
export async function resumeWorkflow(id: string, scheduled = false) {
  requireRuns();
  const workflow = get(id);
  const run = workflow.runs.find((r) => !r.started);
  if (!run) throw new Error("This workflow has no paused run.");
  const indexes = workflowDispatchIndexes(workflow.steps, run.approvedGates);
  for (const index of indexes) {
    const taskId = run.taskIds[index];
    const detail = await hermes.showTask(taskId);
    if (detail.task.status === "blocked") {
      requireRuns();
      if (scheduled && !get(id).scheduleRule?.enabled) throw Error("This workflow schedule was switched off before dispatch.");
      await hermes.unblockTask(taskId, undefined, {workflowApproved:true});
    }
  }
  updateJson<Db>("workflows", {}, (d) => { const saved = d[id].runs.find((r) => r.taskIds[0] === run.taskIds[0]); if (saved) saved.started = !workflow.steps.some((step, index) => step.humanGate && !run.approvedGates?.includes(index)); });
  return { taskIds: run.taskIds, started: !workflow.steps.some((step, index) => step.humanGate && !run.approvedGates?.includes(index)) };
}

export async function tickWorkflowSchedules(now = new Date()) {
  if (!getSettings().agentRuns) return { started: [], errors: [], paused: true };
  const started: string[] = [];
  const errors: { id: string; error: string }[] = [];
  for (const workflow of listWorkflows()) {
    const slot = dueSlot(workflow.scheduleRule, now);
    if (!slot) continue;
    if (workflow.lastScheduleSlot === slot) {
      if (!workflow.steps.some(step => step.humanGate) && workflow.runs.some((run) => run.scheduleSlot === slot && !run.started)) {
        try { await resumeWorkflow(workflow.id, true); started.push(workflow.id); } catch (error) { errors.push({ id: workflow.id, error: (error as Error).message }); }
      }
      continue;
    }
    try { const result = await runWorkflow(workflow.id, slot); if (result.started) started.push(workflow.id); }
    catch (error) { errors.push({ id: workflow.id, error: (error as Error).message }); }
  }
  return { started, errors, paused: false };
}

// Human gates are completed only by this explicit dashboard action. They are never agent-dispatched.
export async function approveWorkflowGate(id: string, taskId: unknown, confirmation: unknown, result: unknown) {
  const workflow = get(id);
  const run = workflow.runs.find(run => run.taskIds.includes(String(taskId)));
  if (!run || typeof result !== 'string' || result.trim().length < 10 || result.length > 2000) throw Error('Provide the completed check, quote or run reference (10 to 2000 characters).');
  const index = run.taskIds.indexOf(String(taskId));
  const completed: number[] = [];
  for (const required of workflow.steps[index]?.after || []) {
    const detail = await hermes.showTask(run.taskIds[required]);
    if (detail.task.status === 'done') completed.push(required);
  }
  validateWorkflowGate(workflow.steps, index, run.approvedGates || [], completed, confirmation);
  await hermes.completeTask(String(taskId), 'Marcus confirmed: ' + result.trim());
  updateJson<Db>('workflows', {}, db => {
    const saved = db[id].runs.find(item => item.taskIds.includes(String(taskId)));
    if (!saved) throw Error('Workflow run changed.');
    saved.approvedGates = [...new Set([...(saved.approvedGates || []), index])];
    saved.gateResults = {...saved.gateResults, [index]: result.trim()};
  });
  return {ok:true, message:'Gate recorded. Resume the workflow explicitly to dispatch eligible agent steps.'};
}
