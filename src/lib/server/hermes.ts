import { requireRuns } from './settings.ts';
import { withAgentRun, checkAgentRun } from './agent-controls.ts';
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { paths } from "./paths.ts";
import { readBoardCounts, readBoardTasks } from "./board-read.ts";

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
    if (!hermesInstalled()) return reject(new HermesError(`Marcus OS not found at ${paths.hermesBin}`));
    const env = { ...process.env, COLUMNS: "220", NO_COLOR: "1", TERM: "dumb", HERMES_KANBAN_BOARD: paths.board };
    const argv = opts.profile ? ["-p", opts.profile, ...args] : args;
    const child = execFile(
      paths.hermesBin,
      argv,
      { timeout: opts.timeoutMs ?? 30_000, maxBuffer: 20 * 1024 * 1024, env, cwd: opts.cwd },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || stdout || err.message).toString().trim().split("\n").slice(-4).join(" ");
          return reject(new HermesError(msg || "Marcus OS command failed"));
        }
        resolve(stdout.toString());
      },
    );
    if (opts.input !== undefined) child.stdin?.write(opts.input);
    child.stdin?.end();
  });
}

function json<T>(text: string): T {
  const start = text.search(/[[{]/);
  if (start < 0) throw new HermesError("Marcus OS returned no data");
  return JSON.parse(text.slice(start)) as T;
}

const kb = (board: string, ...args: string[]) => ["kanban", "--board", board, ...args];

// ---------- boards ----------

export async function ensureBoard(board = paths.board) {
  const boards = await listBoards();
  if (!boards.some((b) => b.slug === board)) {
    await run(["kanban", "boards", "create", board, "--name", "Command Center", "--description", "Marcus OS Dashboard pipeline"]);
  }
}

function boardFile(board: string) {
  if (!/^[a-z0-9_-]{1,80}$/.test(board)) throw new HermesError("Choose a valid board.");
  return board === "default" ? path.join(paths.hermesHome, "kanban.db") : path.join(paths.hermesHome, "kanban", "boards", board, "kanban.db");
}

export async function listBoards() {
  const root = path.join(paths.hermesHome, "kanban", "boards");
  const slugs = new Set<string>();
  if (fs.existsSync(boardFile("default"))) slugs.add("default");
  try { for (const entry of fs.readdirSync(root, { withFileTypes: true })) if (entry.isDirectory() && /^[a-z0-9_-]{1,80}$/.test(entry.name) && fs.existsSync(boardFile(entry.name))) slugs.add(entry.name); } catch {}
  return [...slugs].map((slug) => {
    let name = slug === "default" ? "Default" : slug;
    try { name = JSON.parse(fs.readFileSync(path.join(root, slug, "board.json"), "utf8")).name || name; } catch {}
    return { slug, name };
  });
}

// ---------- tasks ----------

export async function listTasks(board = paths.board, opts: { archived?: boolean; status?: TaskStatus; assignee?: string } = {}) {
  return readBoardTasks(boardFile(board), opts) as Task[];
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
  idempotencyKey?: string;
}) {
  const board = input.board ?? paths.board;
  if (!input.blocked) requireRuns();
  if (!input.blocked) checkAgentRun(input.assignee || 'jordan', {operation:'Create runnable board card',billing:'unknown'});
  const args = kb(board, "create", input.title, "--created-by", "marcus", "--json");
  // Bodies go through a temp file so new lines and dashes survive.
  let bodyFile: string | null = null;
  if (input.body) {
    bodyFile = path.join(os.tmpdir(), `hermes-body-${process.pid}-${Date.now()}.md`);
    fs.writeFileSync(bodyFile, input.body);
    args.push("--body-file", bodyFile);
  }
  if (input.idempotencyKey) args.push("--idempotency-key", input.idempotencyKey);
  if (input.assignee) args.push("--assignee", input.assignee);
  for (const p of input.parents ?? []) args.push("--parent", p);
  for (const s of input.skills ?? []) args.push("--skill", s);
  if (input.blocked) args.push("--initial-status", "blocked");
  try {
    if(input.blocked) return json<Task>(await run(args));
    return withAgentRun(input.assignee||'jordan',{operation:'Create runnable board card',billing:'unknown'},async()=>({value:json<Task>(await run(args))}));
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

export async function unblockTask(id: string, board = paths.board, options: {workflowApproved?: true} = {}) {
  requireRuns();
  const detail = await showTask(id, board);
  if (detail.task.body?.includes('[HERMES_HUMAN_GATE]')) throw Error('Approve this human gate from its workflow. It cannot run as an agent task.');
  if (detail.task.body?.includes('[HERMES_GATED_WORKFLOW]') && !options.workflowApproved) throw Error('Resume this card through its workflow so human approvals are checked.');
  await withAgentRun(detail.task.assignee || 'jordan', {operation:`Dispatch board card ${id}`,billing:'unknown'}, async()=>{await run(kb(board, "unblock", id));return {value:undefined};});
}

export async function archiveTask(id: string, board = paths.board) {
  await run(kb(board, "archive", id));
}

export async function completeTask(id: string, result: string, board = paths.board) {
  await run(kb(board, "complete", id, "--result", result, "--force"));
}

export async function assignTask(id: string, profile: string, board = paths.board) {
  const detail = await showTask(id, board);
  if (!['blocked','done','archived'].includes(detail.task.status)) requireRuns();
  if (!['blocked','done','archived'].includes(detail.task.status)) checkAgentRun(profile,{operation:'Assign runnable board card',billing:'unknown'});
  await run(kb(board, "assign", id, profile));
}

export async function boardStats(board = paths.board) {
  return readBoardCounts(boardFile(board));
}

// ---------- profiles ----------

export type Profile = { id: string; name: string; model: string; gateway: string };

export async function listProfiles(): Promise<Profile[]> {
  const out = await run(["profile", "list"]);
  return parseProfiles(out);
}

export function parseProfiles(out: string): Profile[] {
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
  requireRuns();
  const cwd = path.join(paths.data, "agent-scratch");
  fs.mkdirSync(cwd, { recursive: true });
  const context = "Dashboard policy: use the current dashboard Kanban board. Do not save to Obsidian. Do not publish, schedule posts, or send external messages from chat. Those actions require the dedicated review and approval controls.\n\n";
  return withAgentRun(profile==='default'?'jordan':profile,{operation:'Marcus OS profile chat',billing:'unknown'},async()=>{
    const out = await run(["-z", context + prompt], { profile: profile === "default" ? undefined : profile, timeoutMs, cwd });
    return {value:out.trim(),lastMessage:out.trim()};
  });
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
  if (input.name.toLowerCase() === "bigin" && input.url) {
    const runtime = JSON.parse(await run(["--print-runtime-command"])) as string[];
    if (!path.isAbsolute(runtime[0] || "")) throw new HermesError("Marcus OS runtime unavailable.");
    return new Promise<string>((resolve, reject) => {
      const child = execFile(runtime[0], ["-I", path.join(process.cwd(), "scripts/add-bigin-mcp.py")], { timeout: 60_000, maxBuffer: 65536 }, (err, stdout) => {
        try {
          const result = JSON.parse(stdout.trim().split("\n").at(-1) || "{}");
          if (err || result.ok !== true) {
            const message = result.exception === "OAuthNonInteractiveError"
              ? "Zoho sign-in is required. Complete Bigin authorization in an interactive Marcus OS session before saving here."
              : result.category === "401" || result.category === "403"
                ? "Zoho rejected authorization. Reconnect your Bigin account before retrying."
                : "Bigin was not saved. Check the complete Server URL and Zoho authorization, then retry.";
            return reject(new HermesError(message));
          }
          resolve(`Bigin connected. ${result.toolCount} tools verified and saved.`);
        } catch { reject(new HermesError("Bigin registration failed. No connection was confirmed.")); }
      });
      child.stdin?.end(JSON.stringify({url: input.url}));
    });
  }
  const args = ["mcp", "add", input.name];
  if (input.url) args.push("--url", input.url);
  if (input.command) {
    args.push("--command", input.command);
    if (input.args?.length) args.push("--args", ...input.args);
  }
  const output = await run(args, { timeoutMs: 90_000 });
  if (!output.includes(`Saved '${input.name}'`)) throw new HermesError("The server was not saved. This connection requires interactive setup in Marcus OS Terminal.");
  return "MCP server configuration saved. Test the connection before using it.";
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
