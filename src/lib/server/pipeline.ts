import { paths } from "./paths";
import { readJson, updateJson, now } from "./store";
import { getSettings, requireRuns } from "./settings";
import * as hermes from "./hermes";
import { getAgents, qaId, rosterForPrompt } from "./agents";
import { logProject } from "./obsidian";

// Inbox to Shipped. Four stages on top of the real Hermes board:
// capture (idea parked as a blocked card) -> gate (plan waiting for Marcus)
// -> execute (step cards assigned to agents, Quality Control last) -> shipped.
// Ideas are never put in Hermes's triage column, because Hermes auto-splits
// triage cards and starts agents on them, which would skip the approval gate.

export type Stage = "capture" | "gate" | "execute" | "shipped" | "rejected";

export type PlanStep = { key: string; title: string; agent: string; instructions: string; dependsOn: string[] };
export type Plan = { summary: string; kind: string; steps: PlanStep[] };

export type PipelineItem = {
  id: string;
  title: string;
  idea: string;
  kind: string;
  stage: Stage;
  plan: Plan | null;
  planSource: "operator" | "manual" | null;
  stepTasks: Record<string, string>;
  qcTask: string | null;
  waitingForRuns: boolean;
  createdAt: number;
  approvedAt: number | null;
  shippedAt: number | null;
  vaultNote: string | null;
};

export type StepView = PlanStep & { taskId: string | null; status: string; result: string | null };
export type PipelineView = PipelineItem & { steps: StepView[]; progress: number };

type Db = Record<string, PipelineItem>;

const KINDS: [RegExp, string][] = [
  [/\b(website|site|landing|page|blog|seo)\b/i, "Website"],
  [/\b(app|tool|calculator|tracker|dashboard|bot|automation)\b/i, "Tool"],
  [/\b(carousel|reel|post|caption|content|script|video|story)\b/i, "Content"],
  [/\b(lead|leads|outreach|email|prospect|crm|sales)\b/i, "Outreach"],
  [/\b(research|find|analy[sz]e|compare|report|audit)\b/i, "Research"],
];

export function sortIdea(idea: string) {
  return KINDS.find(([re]) => re.test(idea))?.[1] ?? "Project";
}

function titleFrom(idea: string) {
  const first = idea.trim().split(/\n/)[0].replace(/\s+/g, " ");
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

function db() {
  return readJson<Db>("pipeline", {});
}

function save(id: string, patch: Partial<PipelineItem>) {
  let out: PipelineItem | undefined;
  updateJson<Db>("pipeline", {}, (d) => {
    d[id] = { ...d[id], ...patch };
    out = d[id];
  });
  return out!;
}

function get(id: string) {
  const item = db()[id];
  if (!item) throw new Error("That pipeline card was not found.");
  return item;
}

export async function capture(idea: string) {
  const text = idea.trim();
  if (!text) throw new Error("Type an idea first.");
  if (text.length > 4000) throw new Error("Keep the idea under 4000 characters.");
  await hermes.ensureBoard();
  const task = await hermes.createTask({
    title: titleFrom(text),
    body: `${text}\n\n(Captured from the Hermes Dashboard. Waiting for a plan and Marcus's approval.)`,
    blocked: true,
  });
  const item: PipelineItem = {
    id: task.id,
    title: task.title,
    idea: text,
    kind: sortIdea(text),
    stage: "capture",
    plan: null,
    planSource: null,
    stepTasks: {},
    qcTask: null,
    waitingForRuns: false,
    createdAt: now(),
    approvedAt: null,
    shippedAt: null,
    vaultNote: null,
  };
  updateJson<Db>("pipeline", {}, (d) => {
    d[item.id] = item;
  });
  return item;
}

function cleanPlan(raw: unknown, validAgents: Set<string>): Plan {
  const p = (raw ?? {}) as { summary?: unknown; kind?: unknown; steps?: unknown };
  if (!Array.isArray(p.steps) || p.steps.length === 0) throw new Error("The plan needs at least one step.");
  if (p.steps.length > 12) throw new Error("Keep the plan to 12 steps or fewer.");
  const steps: PlanStep[] = p.steps.map((s: Record<string, unknown>, i: number) => {
    const agent = String(s.agent ?? "").trim();
    if (!validAgents.has(agent)) throw new Error(`Step ${i + 1} has an unknown agent: ${agent || "(blank)"}`);
    const title = String(s.title ?? "").trim();
    if (!title) throw new Error(`Step ${i + 1} needs a title.`);
    const deps = Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [];
    return { key: `s${i + 1}`, title: title.slice(0, 120), agent, instructions: String(s.instructions ?? "").slice(0, 4000), dependsOn: deps };
  });
  const keys = new Set(steps.map((s) => s.key));
  for (const s of steps) {
    // Accept "s1" or a bare step number; drop anything that does not point backwards.
    s.dependsOn = s.dependsOn
      .map((d) => (d.startsWith("s") ? d : `s${Number(d) || 1}`))
      .filter((d) => keys.has(d) && Number(d.slice(1)) < Number(s.key.slice(1)));
  }
  return { summary: String(p.summary ?? "").slice(0, 2000), kind: String(p.kind ?? ""), steps };
}

function planText(plan: Plan, names: Record<string, string>) {
  return [
    plan.summary,
    "",
    ...plan.steps.map(
      (s, i) =>
        `${i + 1}. ${s.title} (${names[s.agent] ?? s.agent})${s.dependsOn.length ? ` after ${s.dependsOn.map((d) => d.slice(1)).join(", ")}` : ""}\n   ${s.instructions}`,
    ),
  ].join("\n");
}

export async function shape(id: string) {
  requireRuns();
  const item = get(id);
  if (item.stage !== "capture" && item.stage !== "gate") throw new Error("This card already has an approved plan.");
  const agents = await getAgents();
  const head = getSettings().headAgent;
  const prompt = [
    "You are the Operator for Marcus Collins. Turn this idea into a short build plan for the agent team.",
    "Reply with JSON only, no prose, in this shape:",
    '{"summary":"what this is and how we will do it, 2 to 4 sentences","kind":"Website|Tool|Content|Outreach|Research|Project","steps":[{"title":"short imperative title","agent":"profile id from the roster","instructions":"what that agent must do and deliver","dependsOn":["s1"]}]}',
    "Rules: 2 to 7 steps. Use only profile ids from the roster. dependsOn lists earlier step keys (s1, s2, ...) that must finish first. Do not add a quality review step, the dashboard adds one.",
    "",
    "Roster:",
    rosterForPrompt(agents),
    "",
    "Idea:",
    item.idea,
  ].join("\n");
  const reply = await hermes.askProfile(head, prompt);
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The Operator did not return a plan. Try again or write the plan yourself.");
  const plan = cleanPlan(JSON.parse(match[0]), new Set(agents.map((a) => a.id)));
  const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  await hermes.comment(id, `Plan from the Operator:\n\n${planText(plan, names)}`, head);
  return save(id, { plan, planSource: "operator", stage: "gate", kind: plan.kind || item.kind });
}

export async function savePlan(id: string, raw: unknown) {
  const item = get(id);
  if (item.stage !== "capture" && item.stage !== "gate") throw new Error("This card already has an approved plan.");
  const agents = await getAgents();
  const plan = cleanPlan(raw, new Set(agents.map((a) => a.id)));
  const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  await hermes.comment(id, `Plan written by Marcus:\n\n${planText(plan, names)}`);
  return save(id, { plan, planSource: "manual", stage: "gate", kind: plan.kind || item.kind });
}

export async function approve(id: string) {
  const item = get(id);
  if (item.stage !== "gate" || !item.plan) throw new Error("Only a card with a plan at the Human Gate can be approved.");
  const runs = getSettings().agentRuns;
  const stepTasks: Record<string, string> = {};
  for (const step of item.plan.steps) {
    const task = await hermes.createTask({
      title: step.title,
      body: `${step.instructions}\n\nPart of: ${item.title}\nOriginal idea: ${item.idea}`,
      assignee: step.agent,
      parents: step.dependsOn.map((d) => stepTasks[d]).filter(Boolean),
      blocked: true,
    });
    stepTasks[step.key] = task.id;
  }
  const qc = await hermes.createTask({
    title: `Quality check: ${item.title}`.slice(0, 120),
    body: `Check every deliverable for "${item.title}" against the approved plan before it ships. List what passes, what fails and what is missing.\n\nPlan:\n${item.plan.summary}`,
    assignee: qaId(),
    parents: Object.values(stepTasks),
    blocked: true,
  });
  await hermes.comment(id, `Approved by Marcus. ${item.plan.steps.length} steps plus a quality check.${runs ? "" : " Waiting for agent runs to be turned on."}`);
  const saved = save(id, { stage: "execute", stepTasks, qcTask: qc.id, approvedAt: now(), waitingForRuns: true });
  if (runs) return start(id);
  return saved;
}

export async function start(id: string) {
  requireRuns();
  const item = get(id);
  if (item.stage !== "execute") throw new Error("Only approved cards can start.");
  for (const taskId of [...Object.values(item.stepTasks), item.qcTask].filter(Boolean) as string[]) {
    const detail = await hermes.showTask(taskId);
    if (detail.task.status === "blocked") await hermes.unblockTask(taskId);
  }
  return save(id, { waitingForRuns: false });
}

export async function reject(id: string, reason?: string) {
  const item = get(id);
  if (item.stage === "execute" || item.stage === "shipped") throw new Error("Approved work cannot be rejected here. Archive its cards on the Kanban.");
  await hermes.comment(id, `Rejected by Marcus.${reason ? ` ${reason}` : ""}`);
  await hermes.archiveTask(id);
  return save(id, { stage: "rejected" });
}

async function ship(item: PipelineItem, byId: Map<string, hermes.Task>) {
  const agents = await getAgents();
  const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const steps = (item.plan?.steps ?? []).map((s) => {
    const t = byId.get(item.stepTasks[s.key]);
    return { title: s.title, agent: names[s.agent] ?? s.agent, result: t?.result ?? null };
  });
  const qc = item.qcTask ? byId.get(item.qcTask) : undefined;
  if (qc) steps.push({ title: "Quality check", agent: "Quality Control", result: qc.result });
  let vaultNote: string | null = null;
  try {
    vaultNote = logProject({
      title: item.title,
      idea: item.idea,
      plan: item.plan ? planText(item.plan, names) : "",
      steps,
      taskId: item.id,
      board: paths.board,
    });
  } catch {
    vaultNote = null;
  }
  try {
    await hermes.completeTask(item.id, `Shipped. ${steps.length} steps done.${vaultNote ? ` Logged to Obsidian: ${vaultNote}` : ""}`);
  } catch {}
  return save(item.id, { stage: "shipped", shippedAt: now(), vaultNote });
}

export async function listPipeline(): Promise<{ items: PipelineView[]; offline: string | null }> {
  const all = Object.values(db()).filter((i) => i.stage !== "rejected");
  let tasks: hermes.Task[] = [];
  let offline: string | null = null;
  try {
    tasks = await hermes.listTasks(paths.board, { archived: true });
  } catch (e) {
    offline = (e as Error).message;
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const items: PipelineView[] = [];
  for (let item of all) {
    if (!offline && item.stage === "execute") {
      const ids = [...Object.values(item.stepTasks), item.qcTask].filter(Boolean) as string[];
      if (ids.length && ids.every((t) => byId.get(t)?.status === "done")) item = await ship(item, byId);
    }
    const steps: StepView[] = (item.plan?.steps ?? []).map((s) => {
      const t = byId.get(item.stepTasks[s.key]);
      return { ...s, taskId: item.stepTasks[s.key] ?? null, status: t?.status ?? (item.stepTasks[s.key] ? "unknown" : "planned"), result: t?.result ?? null };
    });
    if (item.qcTask) {
      const t = byId.get(item.qcTask);
      steps.push({ key: "qc", title: "Quality check", agent: qaId(), instructions: "Checks every deliverable before it ships.", dependsOn: [], taskId: item.qcTask, status: t?.status ?? "unknown", result: t?.result ?? null });
    }
    const done = steps.filter((s) => s.status === "done").length;
    items.push({ ...item, steps, progress: steps.length ? Math.round((done / steps.length) * 100) : 0 });
  }
  items.sort((a, b) => b.createdAt - a.createdAt);
  return { items, offline };
}
