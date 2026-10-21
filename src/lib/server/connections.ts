import { getComposioMcpStatus } from './composio-mcp.ts';
import { heartbeatEvidence } from './connection-evidence.ts';
import { openMorningStore } from './morning-store.ts';
import { getSettings } from "./settings.ts";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { workerStatus } from "./content-machine.ts";
import { paths } from "./paths.ts";
import { hermesInstalled } from "./hermes.ts";
import { configuredMcp, gatewayEvidence, replyEvidence, probeDetail } from "./connection-evidence.ts";
import { MCP_PROBES, savedProbes } from "./connection-probes.ts";
import { readJson } from "./store.ts";
import { listBridges, dotenvValue } from "./models.ts";

// One place that says what is connected and what still needs Marcus.

export type Check = { id: string; name: string; group: string; ok: boolean; detail: string; todo?: string; probe?: string };

async function reachable(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), redirect: "manual" });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function optionalApp(id: "recast" | "openadkit", port: number) {
  let running = false;
  let configured: boolean | null = null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/crm-health`, { signal: AbortSignal.timeout(2000), redirect: "error" });
    if (response.ok) {
      const body = await response.json();
      running = body.application === id;
      configured = typeof body.configured === "boolean" ? body.configured : null;
    }
  } catch {}
  const installed = fs.existsSync(path.join(path.dirname(paths.crmDir), "integrations", id, ".next", "BUILD_ID"));
  return { id, running, configured, installed };
}

function which(bin: string) {
  return new Promise<boolean>((resolve) => execFile("/usr/bin/which", [bin], { timeout: 1000 }, (err) => resolve(!err)));
}

export async function connections() {
  const checks: Check[] = [];
  const composioMcp = getComposioMcpStatus();
  checks.push({id:'composio-mcp',name:'Composio MCP',group:'Business apps',ok:composioMcp.connected && composioMcp.toolsVerified,detail:composioMcp.connected ? `Signed in. MCP tools verified${'lastCheckedAt' in composioMcp && composioMcp.lastCheckedAt ? ' '+new Date(composioMcp.lastCheckedAt).toLocaleString() : ''}.` : 'Not signed in to Composio from Marcus OS.',todo:composioMcp.connected ? undefined : 'Open Composio connection to sign in. No API key needed.'});
  const hermesOk = hermesInstalled();
  checks.push({ id: "hermes", name: "Marcus OS", group: "Core", ok: hermesOk, detail: hermesOk ? `Found at ${paths.hermesBin}` : "Not found", todo: hermesOk ? undefined : "Install Marcus OS or set HERMES_BIN." });

  // Read current process state directly. Spawning the full Marcus OS CLI for
  // every connection row made this page slow and produced false timeouts under load.
  let state: { pid?: number; kind?: string; gateway_state?: string; served_profiles?: unknown[] } | null = null;
  try { state = JSON.parse(fs.readFileSync(path.join(paths.hermesHome, "gateway_state.json"), "utf8")); } catch {}
  let alive = false;
  if (Number.isInteger(state?.pid) && state!.pid! > 0) { try { process.kill(state!.pid!, 0); alive = true; } catch {} }
  const gateway = gatewayEvidence(state, alive);
  checks.push({ id: "gateways", name: "Agent gateway process", group: "Core", ok: gateway.running, detail: gateway.running ? `Gateway process is running and serving ${gateway.profiles} profiles.` : "Gateway process is not confirmed running.", todo: gateway.running ? undefined : "Check hermes gateway status on this Mac." });
  const supervisor = readJson<{ checkedAt: string; routes: { route: string; ok: boolean; error?: string }[] } | null>("supervisor-health", null);
  const supervisorAge = supervisor ? Date.now() - Date.parse(supervisor.checkedAt) : Infinity;
  const supervisorOk = supervisorAge >= 0 && supervisorAge < 180000 && !!supervisor?.routes.length && supervisor.routes.every((route) => route.ok);
  checks.push({ id: "supervisor", name: "Dashboard supervisor", group: "Core", ok: supervisorOk, detail: supervisor ? `Last checked ${supervisor.checkedAt}.${supervisorAge >= 180000 ? " Heartbeat is stale after 3 minutes." : ""} ${supervisor.routes.filter((route) => !route.ok).map((route) => `${route.route}: ${route.error || "Failed"}`).join("; ")}` : "No saved supervisor heartbeat." });
  const worker = workerStatus();
  checks.push({ id: "content-worker", name: "Content worker", group: "Core", ok: worker.online, detail: worker.heartbeat ? `Last heartbeat ${new Date(worker.heartbeat).toISOString()}.${worker.online ? "" : " Stale after 45 seconds."}` : "No content worker heartbeat." });
  try {
    const senderStore = openMorningStore();
    try {
      const last = senderStore.get<{checkedAt?:string;results:{name:string;ok:boolean}[]}|null>('worker',null);
      const beat = heartbeatEvidence(last?.checkedAt);
      const sender = last?.results.find(step=>step.name==='sender');
      checks.push({id:'outreach-worker',name:'Gmail release worker cycle',group:'Core',ok:beat.ok&&sender?.ok===true,detail:last?.checkedAt?`Last cycle ${last.checkedAt}. ${beat.ok?'Cycle is recent.':'Stale after 3 minutes.'} A recent cycle does not mean sending is enabled.`:'No completed local Gmail worker cycle recorded.'});
    } finally { senderStore.close(); }
  } catch { checks.push({id:'outreach-worker',name:'Gmail release worker cycle',group:'Core',ok:false,detail:'Worker status unavailable. Check persistent storage configuration.'}); }
  const health = readJson<{ checkedAt: number; agents: { ok: boolean }[] } | null>("runtime-health", null);
  const replies = replyEvidence(health);
  checks.push({ id: "agent-replies", name: "Agent reply verification", group: "Core", ok: replies.ok, detail: health ? `${replies.passed} of ${replies.total} replies verified ${new Date(replies.checkedAt).toISOString()}. Evidence age: ${replies.ageHours?.toFixed(1)} hours.${replies.stale ? " Stale after 24 hours. Run agent verification again." : " Saved test evidence, separate from current process state."}` : "No saved reply verification." });
  const probes = savedProbes();
  let config = ""; let credentialText = "";
  try { config = fs.readFileSync(path.join(paths.hermesHome, "config.yaml"), "utf8"); } catch {}
  try { credentialText = fs.readFileSync(path.join(paths.hermesHome, ".env"), "utf8"); } catch {}
  const hasKey = (name: string) => !!(process.env[name] || dotenvValue(credentialText, name));
  const keys: Record<string, boolean> = { OpenRouter: hasKey("OPENROUTER_API_KEY"), OpenAI: hasKey("OPENAI_API_KEY"), "xAI / Grok": hasKey("XAI_API_KEY"), Kimi: hasKey("KIMI_API_KEY") };
  const block = config.match(/^model:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1] ?? "";
  const selectedModel = block.match(/^\s+default:\s*"?([^"\n]+)"?/m)?.[1]?.trim();
  const provider = block.match(/^\s+provider:\s*"?([^"\n]+)"?/m)?.[1]?.trim();
  const model = selectedModel ? `${selectedModel} via ${provider || "configured provider"} (configuration)` : "";
  const [bridges, crmUp, tailscale, recast, openadkit] = await Promise.all([listBridges({ recordedAuth: true }), reachable(paths.crmUrl), which("tailscale"), optionalApp("recast", 3191), optionalApp("openadkit", 3190)]);
  const keyCheck = (id: string, name: string, label: string, todo: string) =>
    checks.push({ id, name, group: "Marcus OS model keys", ok: !!keys[label], detail: keys[label] ? "Credential configured in Marcus OS, not yet a live generation test" : "Not set", todo: keys[label] ? undefined : todo });
  checks.push({ id: "openrouter", name: "OpenRouter", group: "Marcus OS model keys", ...probeDetail(probes.openrouter), probe: "openrouter", todo: keys.OpenRouter ? undefined : "Add the OpenRouter credential in Marcus OS." });
  keyCheck("openai", "OpenAI", "OpenAI", "Optional. Add only if an agent should call OpenAI directly.");
  keyCheck("xai", "Grok (xAI)", "xAI / Grok", "Optional. Grok already works through OpenRouter.");
  keyCheck("kimi", "Kimi", "Kimi", "Optional. Kimi already works through OpenRouter.");
  if (model) checks.push({ id: "hermes-model", name: "Default Marcus OS profile model (Marcus Head Agent)", group: "Marcus OS model keys", ok: true, detail: model });

  for (const b of bridges) checks.push({ id: `bridge-${b.id}`, name: `${b.name} bridge`, group: "Direct model bridges", ok: b.ready, detail: `${b.via}. ${b.note}`, todo: b.ready ? undefined : b.note });

  const configured = configuredMcp(config);
  for (const id of MCP_PROBES) {
    const enabled = configured.some((m) => m.name === id && m.enabled);
    checks.push({ id: `mcp-${id}`, name: id, group: "MCP authenticated access", ...(enabled ? probeDetail(probes[id]) : { ok: false, detail: "Missing or disabled in Marcus OS configuration." }), probe: id });
  }
  for (const m of configured.filter((m) => !MCP_PROBES.includes(m.name as typeof MCP_PROBES[number]))) checks.push({ id: `mcp-${m.name}`, name: m.name, group: "MCP configuration", ok: false, detail: m.enabled ? "Configured and enabled. Authenticated access has not been tested." : "Configured but disabled." });

  checks.push({ id: "crm", name: "CRM (Studio)", group: "Business apps", ok: crmUp, detail: crmUp ? `Running at ${paths.crmUrl}` : `No successful response within 2.5 seconds at ${paths.crmUrl}`, todo: crmUp ? undefined : 'Start it: cd "~/Desktop/Content and Outreach App/app" && npm run dev' });
  const crmDb = fs.existsSync(`${paths.crmDir}/data/studio.db`);
  checks.push({ id: "social", name: "Social workspace data", group: "Business apps", ok: crmDb, detail: crmDb ? "Reading the CRM's social drafts and schedule" : "CRM database not found" });
  const postiz = !!process.env.POSTIZ_API_KEY;
  checks.push({ id: "postiz", name: "Postiz (publishing)", group: "Business apps", ok: postiz, detail: postiz ? "Key set. Marcus OS posts and schedules carousels through Postiz." : "Not connected", todo: postiz ? undefined : "Add POSTIZ_API_KEY to .env.local, then restart Marcus OS" });
  const hf = !!(process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET);
  checks.push({ id: "higgsfield", name: "Higgsfield (optional video API)", group: "Business apps", ok: hf, detail: hf ? "Credential configured. Reel covers use the Codex image handoff." : "Not connected", todo: hf ? undefined : "Add HF_API_KEY_ID and HF_API_KEY_SECRET to .env.local, then restart Marcus OS" });

  for (const app of [recast, openadkit]) {
    const name = app.id === "recast" ? "Recast" : "OpenAdKit";
    const detail = app.running ? `Running. ${app.configured === true ? "Provider settings are present; generation has not been tested." : app.configured === false ? "Provider setup is incomplete." : "Provider setup has not been verified."}` : app.installed ? "Installed but not running. Optional, separate from the Reel workflow." : "Not installed or not built. Optional, separate from the Reel workflow.";
    checks.push({ id: app.id, name: `${name} (optional)`, group: "Optional apps", ok: app.running, detail });
  }

  const vault = fs.existsSync(paths.vault);
  const exportStatus = readJson<{errors:string[]}>("obsidian-export-status", {errors:[]});
  checks.push({ id: "obsidian", name: "Obsidian vault", group: "Memory", ok: vault && !exportStatus.errors.length, detail: exportStatus.errors.length ? exportStatus.errors.join(" ") : vault ? `${paths.vault} (available, automatic saves ${getSettings().obsidianAutoSave ? "enabled" : "disabled"})` : "Vault not found" });

  const telegram = fs.existsSync(`${paths.hermesHome}/channel_directory.json`);
  checks.push({ id: "telegram", name: "Telegram (phone chat with Marcus OS)", group: "Phone", ok: telegram, detail: telegram ? "Paired through the Marcus OS gateway" : "Not paired", todo: telegram ? undefined : "Run: hermes gateway setup" });
  checks.push({ id: "tailscale", name: "Tailscale (dashboard on your phone)", group: "Phone", ok: tailscale, detail: tailscale ? "Installed" : "Not installed", todo: tailscale ? undefined : "Install Tailscale on the Mac and iPhone, then run: tailscale serve 3200" });

  return { checks };
}
