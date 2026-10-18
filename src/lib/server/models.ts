import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";

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

function cli(bin: string, args: string[], input?: string, timeoutMs = 240_000) {
  return new Promise<string>((resolve, reject) => {
    const cwd = path.join(paths.data, "agent-scratch");
    fs.mkdirSync(cwd, { recursive: true });
    const child = execFile(bin, args, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) return reject(new Error((errOut || out || err.message).toString().trim().split("\n").slice(-3).join(" ")));
      resolve(out.toString().trim());
    });
    if (input !== undefined) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
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
  check: () => { ready: boolean; note: string };
  send: (prompt: string, model?: string) => Promise<string>;
};

const defs: Def[] = [
  {
    id: "claude",
    name: "Claude",
    provider: "Anthropic",
    via: "Claude Code on this Mac (your subscription)",
    check: () =>
      fs.existsSync(paths.claudeBin)
        ? { ready: true, note: "Claude Code found. Uses your Claude login." }
        : { ready: false, note: `Claude Code not found at ${paths.claudeBin}` },
    send: (prompt) => cli(paths.claudeBin, ["-p", "--output-format", "text"], prompt),
  },
  {
    id: "codex",
    name: "Codex",
    provider: "OpenAI",
    via: "Codex CLI on this Mac (your subscription)",
    check: () =>
      fs.existsSync(paths.codexBin)
        ? { ready: true, note: "Codex found. Runs read-only in a scratch folder." }
        : { ready: false, note: `Codex not found at ${paths.codexBin}` },
    send: (prompt) => cli(paths.codexBin, ["exec", "--skip-git-repo-check", "--sandbox", "read-only", prompt]),
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    provider: "Grok, Kimi, GPT, Gemini and more",
    via: "OpenRouter API key",
    check: () =>
      process.env.OPENROUTER_API_KEY
        ? { ready: true, note: "Key set." }
        : { ready: false, note: "Add OPENROUTER_API_KEY to .env.local. Hermes agents already use their own key." },
    send: (prompt, model) =>
      openAiCompatible(
        "https://openrouter.ai/api/v1/chat/completions",
        process.env.OPENROUTER_API_KEY!,
        model || process.env.OPENROUTER_MODEL || "x-ai/grok-4.7",
        prompt,
      ),
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

export function listBridges(): Bridge[] {
  return defs.map((d) => ({ id: d.id, name: d.name, provider: d.provider, via: d.via, ...d.check() }));
}

export async function sendToBridge(id: string, prompt: string, model?: string) {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown model bridge: ${id}`);
  const state = def.check();
  if (!state.ready) throw new Error(state.note);
  return def.send(prompt, model);
}

// Claude desk for carousel copy. Only the named tools are available (web search for news, reading uploads for Clone).
export function claudeSend(prompt: string, opts: { tools?: string[]; dirs?: string[] } = {}) {
  if (!fs.existsSync(paths.claudeBin)) return Promise.reject(new Error(`Claude Code not found at ${paths.claudeBin}`));
  // Lean run: no MCP servers, skills, plugins or settings files, so each call carries only this prompt (about 3k tokens of setup).
  const args = ["-p", "--output-format", "text", "--strict-mcp-config", "--disable-slash-commands", "--setting-sources", ""];
  args.push("--tools", opts.tools?.length ? opts.tools.join(",") : "");
  if (opts.tools?.length) args.push("--allowedTools", ...opts.tools);
  if (opts.dirs?.length) args.push("--add-dir", ...opts.dirs);
  return cli(paths.claudeBin, args, prompt, 300_000);
}
