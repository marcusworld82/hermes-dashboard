import { withAgentRun, checkAgentRun } from './agent-controls.ts';
import { requireRuns } from './settings.ts';
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.ts";
import { readTeam } from "./agents.ts";

// Direct model bridges, used when Marcus talks to a model instead of a Hermes agent.
// Each one reports whether it is ready; none of them runs while agent runs are off.

export type Bridge = {
  id: string;
  name: string;
  provider: string;
  via: string;
  ready: boolean;
  note: string;
};

// Read only the requested credential. Never copy the Hermes environment into the app.
export function dotenvValue(text: string, key: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match?.[1] !== key) continue;
    const value = match[2];
    return ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) ? value.slice(1, -1) : value.replace(/\s+#.*$/, "");
  }
}

function openRouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try { return dotenvValue(fs.readFileSync(path.join(paths.hermesHome, ".env"), "utf8"), "OPENROUTER_API_KEY"); } catch { return undefined; }
}

function openRouterModels() {
  if (process.env.OPENROUTER_MODEL) return [process.env.OPENROUTER_MODEL];
  const models: string[] = [];
  for (const agent of readTeam().agents.filter((a) => a.provider === "openrouter")) {
    try {
      const config = fs.readFileSync(path.join(paths.hermesHome, "profiles", agent.id, "config.yaml"), "utf8");
      const model = config.match(/^model:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1]?.match(/^\s+default:\s*"?([^"\n]+)"?/m)?.[1]?.trim();
      if (model && !models.includes(model)) models.push(model);
    } catch {}
  }
  if (!models.length) throw new Error("Choose OPENROUTER_MODEL or configure an OpenRouter agent first.");
  return models;
}

export async function sendConfiguredOpenRouter(models: string[], send: (model: string) => Promise<string>) {
  let lastError: unknown;
  for (const model of models) {
    try { return `${await send(model)}\n\nOpenRouter model: ${model}`; }
    catch (error) {
      lastError = error;
      // Some configured models only accept agentic harnesses, not plain chat.
      // Try another existing configured model, but never retry authentication or billing errors.
      if (!/^(403|404) /.test((error as Error).message)) throw error;
    }
  }
  throw lastError ?? new Error("No configured OpenRouter model is available for direct chat.");
}

type AuthState = { ready: boolean; note: string };
const authCache = new Map<string, { at: number; value: Promise<AuthState> }>();
function subscriptionAuth(id: "claude" | "codex", bin: string): Promise<AuthState> {
  if (!fs.existsSync(bin)) return Promise.resolve({ ready: false, note: `${id} CLI not installed.` });
  const cached = authCache.get(id);
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const value = new Promise<AuthState>((resolve) => {
    execFile(bin, id === "claude" ? ["auth", "status"] : ["login", "status"], { timeout: 8000, maxBuffer: 128 * 1024 }, (error, stdout, stderr) => {
      let authenticated = false;
      if (id === "claude") { try { authenticated = JSON.parse(stdout).loggedIn === true; } catch {} }
      else authenticated = !error && /logged in/i.test(`${stdout} ${stderr}`);
      resolve({ ready: authenticated, note: authenticated ? `${id === "claude" ? "Claude" : "Codex"} subscription login verified on this Mac. A live reply is checked when you send a message.` : `Sign in with ${id === "claude" ? "claude auth login" : "codex login"} on this Mac.` });
    });
  });
  authCache.set(id, { at: Date.now(), value });
  return value;
}

function cli(bin: string, args: string[], input?: string, timeoutMs = 240_000, env: NodeJS.ProcessEnv = process.env) {
  return new Promise<string>((resolve, reject) => {
    const cwd = path.join(paths.data, "agent-scratch");
    fs.mkdirSync(cwd, { recursive: true });
    const child = execFile(bin, args, { cwd, env, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) return reject(new Error((errOut || out || err.message).toString().trim().split("\n").slice(-3).join(" ")));
      resolve(out.toString().trim());
    });
    // Codex appends piped stdin even when a prompt argument is present.
    // Always deliver EOF or a direct-model conversation waits forever.
    if (input !== undefined) child.stdin?.write(input);
    child.stdin?.end();
  });
}

async function openAiCompatible(url: string, key: string, model: string, prompt: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

type Def = Omit<Bridge, "ready" | "note"> & {
  check: () => { ready: boolean; note: string } | Promise<AuthState>;
  send: (prompt: string, model?: string) => Promise<string>;
};

const defs: Def[] = [
  {
    id: "claude",
    name: "Claude",
    provider: "Anthropic",
    via: "Claude Code on this Mac (your subscription)",
    check: () => subscriptionAuth("claude", paths.claudeBin),
    send: (prompt) => cli(paths.claudeBin, ["-p", "--output-format", "text"], prompt),
  },
  {
    id: "codex",
    name: "Codex",
    provider: "OpenAI",
    via: "Codex CLI on this Mac (your subscription)",
    check: () => subscriptionAuth("codex", paths.codexBin),
    send: (prompt) => cli(paths.codexBin, ["exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", prompt]),
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    provider: "Grok, Kimi, GPT, Gemini and more",
    via: "OpenRouter API key",
    check: () =>
      openRouterKey()
        ? { ready: true, note: "Credential available from the app or Marcus OS. A live reply is checked when you send a message." }
        : { ready: false, note: "Add OPENROUTER_API_KEY to .env.local. Marcus OS agents already use their own key." },
    send: (prompt, model) => {
      const send = (selected: string) => openAiCompatible("https://openrouter.ai/api/v1/chat/completions", openRouterKey()!, selected, prompt);
      return model ? send(model) : sendConfiguredOpenRouter(openRouterModels(), send);
    },
  },
  {
    id: "muse",
    name: "Muse",
    provider: "Meta",
    via: "Meta Model API (OpenAI-compatible, pay as you go)",
    // Only the key is needed. The URL and model default to Meta's documented values; the
    // contributor model is about 10 times cheaper, and Meta may train on those chats.
    check: () =>
      process.env.MUSE_API_KEY
        ? { ready: true, note: `Using ${process.env.MUSE_MODEL || "muse-spark-1.3"}.` }
        : { ready: false, note: "Add MUSE_API_KEY (starts with LLM_) from dev.meta.ai, API keys tab." },
    send: (prompt) =>
      openAiCompatible(
        `${(process.env.MUSE_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "")}/chat/completions`,
        process.env.MUSE_API_KEY!,
        process.env.MUSE_MODEL || "muse-spark-1.3",
        prompt,
      ),
  },
  {
    id: "manus",
    name: "Manus",
    provider: "Manus",
    via: "Manus API",
    check: () => ({
      ready: false,
      note: process.env.MANUS_API_KEY
        ? "Key saved. The Manus bridge still needs to be written from Manus's API docs."
        : "Not built yet. Needs a Manus API key and their API docs.",
    }),
    send: async () => {
      throw new Error("The Manus bridge is not built yet.");
    },
  },
];

export async function listBridges(opts: { recordedAuth?: boolean } = {}): Promise<Bridge[]> {
  let recorded: { checkedAt: number; bridges: { id: string; ok: boolean }[] } | null = null;
  if (opts.recordedAuth) { try { recorded = JSON.parse(fs.readFileSync(path.join(paths.data, "runtime-bridge-health.json"), "utf8")); } catch {} }
  return Promise.all(defs.map(async (d) => {
    if (opts.recordedAuth && (d.id === "claude" || d.id === "codex")) {
      const installed = fs.existsSync(d.id === "claude" ? paths.claudeBin : paths.codexBin);
      const verified = recorded?.bridges.find((item) => item.id === d.id)?.ok === true;
      const when = recorded ? new Date(recorded.checkedAt * 1000).toLocaleString("en-US", { timeZone: "America/New_York" }) : "not yet recorded";
      return { id: d.id, name: d.name, provider: d.provider, via: d.via, ready: installed && verified, note: installed && verified ? `CLI installed. Last reply verified ${when} ET. Login is checked before sending.` : "No verified reply recorded. Open a chat to verify the subscription login." };
    }
    return { id: d.id, name: d.name, provider: d.provider, via: d.via, ...await d.check() };
  }));
}

export async function sendToBridge(id: string, prompt: string, model?: string) {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown model bridge: ${id}`);
  const state = await def.check();
  if (!state.ready) throw new Error(state.note);
  requireRuns();
  if(id==='claude') return claudeSend(prompt,{agentId:'claude'});
  return withAgentRun(id,{operation:'Direct model chat',billing:'unknown'},async()=>{const value=await def.send(prompt,model);return {value,lastMessage:value};});
}

// Claude desk for carousel copy. Only the named tools are available (web search for news, reading uploads for Clone).
export function claudeSubscriptionEnvironment(input:NodeJS.ProcessEnv=process.env){
  const env={...input};
  for(const key of ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','ANTHROPIC_CUSTOM_HEADERS','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY','CLAUDE_CODE_SIMPLE'])delete env[key];
  return env;
}
export async function claudeBilling(env:NodeJS.ProcessEnv):Promise<'subscription'|'unknown'>{
  try {const result=JSON.parse(await cli(paths.claudeBin,['auth','status'],undefined,10000,env));return result.loggedIn===true&&result.authMethod==='claude.ai'?'subscription':'unknown';}catch{return 'unknown';}
}
export async function claudeSend(prompt: string, opts: { tools?: string[]; dirs?: string[]; agentId?: string } = {}) {
  requireRuns();
  const agent=opts.agentId??'claude', env=claudeSubscriptionEnvironment();
  // Pause is checked before even inspecting CLI authentication.
  checkAgentRun(agent,{operation:'Claude desk',billing:'subscription'});
  if (!fs.existsSync(paths.claudeBin)) throw new Error(`Claude Code not found at ${paths.claudeBin}`);
  const billing=await claudeBilling(env);
  const args = ["-p", "--output-format", "json", "--max-budget-usd", "1", "--strict-mcp-config", "--disable-slash-commands", "--setting-sources", ""];
  args.push("--tools", opts.tools?.length ? opts.tools.join(",") : "");
  if (opts.tools?.length) args.push("--allowedTools", ...opts.tools);
  if (opts.dirs?.length) args.push("--add-dir", ...opts.dirs);
  return withAgentRun(agent,{operation:'Claude desk',billing,maxCostUsd:1},async()=>{
    const output=JSON.parse(await cli(paths.claudeBin,args,prompt,300000,env));
    if(output.is_error||typeof output.result!=='string')throw Error('Claude did not return a complete result. Usage remains reserved.');
    // Claude's total_cost_usd is an API-equivalent estimate under subscription,
    // not a cash charge. Unknown billing likewise never becomes invented spend.
    return {value:output.result,lastMessage:output.result};
  });
}
