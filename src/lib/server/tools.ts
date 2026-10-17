import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { paths } from "./paths";

// Recast and OpenAdKit are separate apps installed next to the CRM. The dashboard
// shows them in a frame and can start them, the same way the CRM's Social tab does.

export type ToolId = "recast" | "openadkit";

type Def = { id: ToolId; name: string; port: number; folder: string; extraEnv: () => Record<string, string> };

const home = os.homedir();
const integrations = process.env.INTEGRATIONS_DIR || path.join(path.dirname(paths.crmDir), "integrations");

const defs: Record<ToolId, Def> = {
  recast: {
    id: "recast",
    name: "Recast",
    port: 3191,
    folder: path.join(integrations, "recast"),
    extraEnv: () => ({ YTDLP_PATH: path.join(home, ".local/bin/yt-dlp"), FFMPEG_PATH: path.join(home, ".local/bin/ffmpeg") }),
  },
  openadkit: { id: "openadkit", name: "OpenAdKit", port: 3190, folder: path.join(integrations, "openadkit"), extraEnv: () => ({}) },
};

export function isTool(id: string): id is ToolId {
  return id === "recast" || id === "openadkit";
}

const url = (d: Def) => `http://127.0.0.1:${d.port}`;

// Only a small list of variables is passed on, so no dashboard or CRM keys reach these apps.
function env(d: Def): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME"];
  const base: Record<string, string> = Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k] as string]));
  return { ...base, ...d.extraEnv(), NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
}

export async function toolStatus(id: ToolId) {
  const d = defs[id];
  const built = fs.existsSync(path.join(d.folder, ".next", "BUILD_ID"));
  const base = { id, name: d.name, url: url(d), built, folder: d.folder };
  try {
    const r = await fetch(`${url(d)}/api/crm-health`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { ...base, running: false, configured: null as boolean | null };
    const raw = await r.text();
    const j = raw.length < 1024 ? JSON.parse(raw) : {};
    return { ...base, running: j.application === id, configured: typeof j.configured === "boolean" ? j.configured : null };
  } catch {
    return { ...base, running: false, configured: null as boolean | null };
  }
}

const starting = new Map<ToolId, Promise<Awaited<ReturnType<typeof toolStatus>>>>();

export async function startTool(id: ToolId) {
  const d = defs[id];
  const now = await toolStatus(id);
  if (now.running) return now;
  if (!now.built) throw new Error(`${d.name} is not built yet. See the install notes in the CRM's docs folder.`);
  const pending = starting.get(id);
  if (pending) return pending;
  const job = (async () => {
    fs.mkdirSync(paths.data, { recursive: true });
    const fd = fs.openSync(path.join(paths.data, `${id}.log`), "a", 0o600);
    try {
      const child = spawn(process.execPath, [path.join(d.folder, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(d.port)], {
        cwd: d.folder,
        env: env(d),
        detached: true,
        stdio: ["ignore", fd, fd],
      });
      child.on("error", () => {});
      child.unref();
    } finally {
      fs.closeSync(fd);
    }
    for (let n = 0; n < 40; n++) {
      await new Promise((r) => setTimeout(r, 250));
      const s = await toolStatus(id);
      if (s.running) return s;
    }
    throw new Error(`${d.name} did not start. Check data/${id}.log, or whether port ${d.port} is already in use.`);
  })();
  starting.set(id, job);
  try {
    return await job;
  } finally {
    starting.delete(id);
  }
}
