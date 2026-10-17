import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { paths } from "./paths";

// Thin wrapper over the hermes CLI. Arguments are passed as a list (no shell),
// so user text can never be run as a command.

export type TaskStatus =
  | "triage" | "todo" | "ready" | "running" | "review" | "blocked" | "done" | "scheduled" | "archived";

export type Task = {
  id: string;
  title: string;
  body: string | null;
  assignee: string | null;
  status: TaskStatus;
  priority: number;
  created_by: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  result: string | null;
  skills: string[];
  last_failure_error: string | null;
};

export type TaskDetail = {
  task: Task;
  latest_summary: string | null;
  parents: string[];
  children: string[];
  comments: { author: string; body: string; created_at: number }[];
  events: { kind: string; payload: unknown; created_at?: number }[];
  runs: Record<string, unknown>[];
};

export class HermesError extends Error {}

export function hermesInstalled() {
  return fs.existsSync(paths.hermesBin);
}

function run(args: string[], opts: { timeoutMs?: number; input?: string; cwd?: string; profile?: string } = {}) {
  return new Promise<string>((resolve, reject) => {
    if (!hermesInstalled()) return reject(new HermesError(`Hermes not found at ${paths.hermesBin}`));
    const env = { ...process.env, COLUMNS: "220", NO_COLOR: "1", TERM: "dumb" };
    const argv = opts.profile ? ["-p", opts.profile, ...args] : args;
    const child = execFile(
      paths.hermesBin,
      argv,
      { timeout: opts.timeoutMs ?? 30_000, maxBuffer: 20 * 1024 * 1024, env, cwd: opts.cwd },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || stdout || err.message).toString().trim().split("\n").slice(-4).join(" ");
          return reject(new HermesError(msg || "Hermes command failed"));
        }
        resolve(stdout.toString());
      },
    );
    if (opts.input !== undefined) {
      child.stdin?.write(opts.input);
      child.stdin?.end();
    }
  });
}

function json<T>(text: string): T {
  const start = text.search(/[[{]/);
  if (start < 0) throw new HermesError("Hermes returned no data");
  return JSON.parse(text.slice(start)) as T;
}

const kb = (board: string, ...args: string[]) => ["kanban", "--board", board, ...args];

// ---------- boards ----------

export async function ensureBoard(board = paths.board) {
  const boards = json<{ slug: string }[]>(await run(["kanban", "boards", "list", "--json"]));
  if (!boards.some((b) => b.slug === board)) {
    await run(["kanban", "boards", "create", board, "--name", "Command Center", "--description", "Hermes Dashboard pipeline"]);
  }
}

export async function listBoards() {
  return json<{ slug: string; name: string; counts?: Record<string, number> }[]>(
    await run(["kanban", "boards", "list", "--json"]),
  );
}

// ---------- tasks ----------

export async function listTasks(board = paths.board, opts: { archived?: boolean; status?: TaskStatus; assignee?: string } = {}) {
  const args = kb(board, "list", "--json", "--sort", "created-desc");
  if (opts.archived) args.push("--archived");
  if (opts.status) args.push("--status", opts.status);
  if (opts.assignee) args.push("--assignee", opts.assignee);
  return json<Task[]>(await run(args));
}

export async function showTask(id: string, board = paths.board) {
  return json<TaskDetail>(await run(kb(board, "show", id, "--json")));
}

export async function createTask(input: {
  title: string;
  body?: string;
  assignee?: string;
  parents?: string[];
  skills?: string[];
  blocked?: boolean;
  board?: string;
}) {
  const board = input.board ?? paths.board;
  const args = kb(board, "create", input.title, "--created-by", "marcus", "--json");
  // Bodies go through a temp file so new lines and dashes survive.
  let bodyFile: string | null = null;
  if (input.body) {
    bodyFile = path.join(os.tmpdir(), `hermes-body-${process.pid}-${Date.now()}.md`);
    fs.writeFileSync(bodyFile, input.body);
    args.push("--body-file", bodyFile);
  }
  if (input.assignee) args.push("--assignee", input.assignee);
  for (const p of input.parents ?? []) args.push("--parent", p);
  for (const s of input.skills ?? []) args.push("--skill", s);
  if (input.blocked) args.push("--initial-status", "blocked");
  try {
    return json<Task>(await run(args));
  } finally {
    if (bodyFile) fs.rmSync(bodyFile, { force: true });
  }
}

export async function comment(id: string, text: string, author = "marcus", board = paths.board) {
  await run(kb(board, "comment", id, text, "--author", author));
}

export async function blockTask(id: string, reason: string, board = paths.board) {
  await run(kb(board, "block", id, reason, "--kind", "needs_input"));
}

export async function unblockTask(id: string, board = paths.board) {
  await run(kb(board, "unblock", id));
}

export async function archiveTask(id: string, board = paths.board) {
  await run(kb(board, "archive", id));
}

export async function completeTask(id: string, result: string, board = paths.board) {
  await run(kb(board, "complete", id, "--result", result, "--force"));
}

export async function assignTask(id: string, profile: string, board = paths.board) {
  await run(kb(board, "assign", id, profile));
}

export async function boardStats(board = paths.board) {
  return json<{ by_status: Record<string, number>; by_assignee: Record<string, number> }>(
    await run(kb(board, "stats", "--json")),
  );
}

// ---------- profiles ----------

export type Profile = { id: string; name: string; model: string; gateway: string };

export async function listProfiles(): Promise<Profile[]> {
  const out = await run(["profile", "list"]);
  const rows: Profile[] = [];
  for (const raw of out.split("\n")) {
    const line = raw.replace(/^[\s◆*]+/, "");
    // "Display Name (id) model gateway alias dist" or "id model gateway ..."
    const m = line.match(/^(.+?)\s{1,}((?:[a-z0-9_-]+\/)?[\w.:\-/]+\.?)\s+(running|stopped|off|—|-)\s/i);
    if (!m) continue;
    let name = m[1].trim();
    let id = name;
    const paren = name.match(/^(.*)\(([^)]+)\)\s*$/);
    if (paren) {
      name = paren[1].trim();
      id = paren[2].trim();
    }
    if (id === "default" || name.endsWith("(default)")) id = "default";
    if (/^profile$/i.test(name)) continue;
    rows.push({ id, name: name.replace(/\(default\)$/, "").trim(), model: m[2], gateway: m[3] });
  }
  return rows;
}

// ---------- chat ----------

// Sends one message to a profile and returns the final reply text.
export async function askProfile(profile: string, prompt: string, timeoutMs = 240_000) {
  const cwd = path.join(paths.data, "agent-scratch");
  fs.mkdirSync(cwd, { recursive: true });
  const out = await run(["-z", prompt], { profile: profile === "default" ? undefined : profile, timeoutMs, cwd });
  return out.trim();
}

// ---------- skills and MCP ----------

export async function listSkills() {
  const out = await run(["skills", "list"]);
  const rows: { name: string; category: string; source: string; status: string }[] = [];
  for (const line of out.split("\n")) {
    if (!line.includes("│")) continue;
    const cells = line.split("│").map((c) => c.trim());
    const [, name, category, source, , status] = cells;
    if (!name || name === "Name") continue;
    rows.push({ name, category, source, status });
  }
  return rows;
}

export async function listMcp() {
  const out = await run(["mcp", "list"]);
  const rows: { name: string; transport: string; status: string }[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s{2,}([\w.-]+)\s{2,}(\S+)\s{2,}\S+\s{2,}(.+?)\s*$/);
    if (m && m[1] !== "Name") rows.push({ name: m[1], transport: m[2], status: m[3].replace(/[✓✗]\s*/, "") });
  }
  return rows;
}

export async function addMcp(input: { name: string; url?: string; command?: string; args?: string[] }) {
  const args = ["mcp", "add", input.name];
  if (input.url) args.push("--url", input.url);
  if (input.command) {
    args.push("--command", input.command);
    if (input.args?.length) args.push("--args", ...input.args);
  }
  return run(args, { timeoutMs: 90_000 });
}

export async function hermesStatus() {
  const out = await run(["status"], { timeoutMs: 45_000 });
  const keys: Record<string, boolean> = {};
  let model = "";
  let provider = "";
  for (const line of out.split("\n")) {
    const k = line.match(/^\s{2}([A-Za-z][\w /.()-]+?)\s{2,}(✓|✗)/);
    if (k) keys[k[1].trim()] = k[2] === "✓";
    const mm = line.match(/^\s+Model:\s+(.+)$/);
    if (mm) model = mm[1].trim();
    const pp = line.match(/^\s+Provider:\s+(.+)$/);
    if (pp) provider = pp[1].trim();
  }
  return { keys, model, provider };
}
