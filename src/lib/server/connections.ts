import fs from "node:fs";
import { execFile } from "node:child_process";
import { paths } from "./paths";
import { hermesInstalled, hermesStatus, listMcp, listProfiles } from "./hermes";
import { listBridges } from "./models";
import { vaultReady } from "./obsidian";

// One place that says what is connected and what still needs Marcus.

export type Check = { id: string; name: string; group: string; ok: boolean; detail: string; todo?: string };

async function reachable(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), redirect: "manual" });
    return res.status > 0;
  } catch {
    return false;
  }
}

function which(bin: string) {
  return new Promise<boolean>((resolve) => execFile("/usr/bin/which", [bin], (err) => resolve(!err)));
}

export async function connections() {
  const checks: Check[] = [];
  const hermesOk = hermesInstalled();
  checks.push({ id: "hermes", name: "Hermes", group: "Core", ok: hermesOk, detail: hermesOk ? `Found at ${paths.hermesBin}` : "Not found", todo: hermesOk ? undefined : "Install Hermes or set HERMES_BIN." });

  let gateways = "";
  if (hermesOk) {
    try {
      const profiles = await listProfiles();
      const running = profiles.filter((p) => p.gateway === "running").length;
      gateways = `${running} of ${profiles.length} agent gateways running`;
      checks.push({ id: "gateways", name: "Agent gateways", group: "Core", ok: running > 0, detail: gateways });
    } catch (e) {
      checks.push({ id: "gateways", name: "Agent gateways", group: "Core", ok: false, detail: (e as Error).message });
    }
  }

  let keys: Record<string, boolean> = {};
  let model = "";
  if (hermesOk) {
    try {
      const s = await hermesStatus();
      keys = s.keys;
      model = `${s.model} via ${s.provider}`;
    } catch {}
  }
  const keyCheck = (id: string, name: string, label: string, todo: string) =>
    checks.push({ id, name, group: "Hermes model keys", ok: !!keys[label], detail: keys[label] ? "Key set in Hermes" : "Not set", todo: keys[label] ? undefined : todo });
  keyCheck("openrouter", "OpenRouter", "OpenRouter", "Run: hermes auth (or add OPENROUTER_API_KEY to ~/.hermes/.env)");
  keyCheck("openai", "OpenAI", "OpenAI", "Optional. Add only if an agent should call OpenAI directly.");
  keyCheck("xai", "Grok (xAI)", "xAI / Grok", "Optional. Grok already works through OpenRouter.");
  keyCheck("kimi", "Kimi", "Kimi", "Optional. Kimi already works through OpenRouter.");
  if (model) checks.push({ id: "hermes-model", name: "Default Hermes profile model (Marcus Head Agent)", group: "Hermes model keys", ok: true, detail: model });

  for (const b of listBridges()) checks.push({ id: `bridge-${b.id}`, name: `${b.name} bridge`, group: "Direct model bridges", ok: b.ready, detail: `${b.via}. ${b.note}`, todo: b.ready ? undefined : b.note });

  if (hermesOk) {
    try {
      for (const m of await listMcp()) checks.push({ id: `mcp-${m.name}`, name: m.name, group: "MCP servers", ok: /enabled/i.test(m.status), detail: `${m.transport} (${m.status})` });
    } catch {}
  }

  const crmUp = await reachable(paths.crmUrl);
  checks.push({ id: "crm", name: "CRM (Studio)", group: "Business apps", ok: crmUp, detail: crmUp ? `Running at ${paths.crmUrl}` : `Not running at ${paths.crmUrl}`, todo: crmUp ? undefined : 'Start it: cd "~/Desktop/Content and Outreach App/app" && npm run dev' });
  const crmDb = fs.existsSync(`${paths.crmDir}/data/studio.db`);
  checks.push({ id: "social", name: "Social workspace data", group: "Business apps", ok: crmDb, detail: crmDb ? "Reading the CRM's social drafts and schedule" : "CRM database not found" });
  const postiz = !!process.env.POSTIZ_API_KEY;
  checks.push({ id: "postiz", name: "Postiz (publishing)", group: "Business apps", ok: postiz, detail: postiz ? "Key set. Hermes posts and schedules carousels through Postiz." : "Not connected", todo: postiz ? undefined : "Add POSTIZ_API_KEY to .env.local, then restart Hermes" });
  const hf = !!(process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET);
  checks.push({ id: "higgsfield", name: "Higgsfield (paid images)", group: "Business apps", ok: hf, detail: hf ? "Key set. Prices show before every image." : "Not connected", todo: hf ? undefined : "Add HF_API_KEY_ID and HF_API_KEY_SECRET to .env.local, then restart Hermes" });

  const vault = vaultReady();
  checks.push({ id: "obsidian", name: "Obsidian vault", group: "Memory", ok: vault, detail: vault ? `${paths.vault} (shipped projects go to ${paths.vaultPipelineFolder})` : "Vault not found" });

  const telegram = fs.existsSync(`${paths.hermesHome}/channel_directory.json`);
  checks.push({ id: "telegram", name: "Telegram (phone chat with Hermes)", group: "Phone", ok: telegram, detail: telegram ? "Paired through the Hermes gateway" : "Not paired", todo: telegram ? undefined : "Run: hermes gateway setup" });
  const tailscale = await which("tailscale");
  checks.push({ id: "tailscale", name: "Tailscale (dashboard on your phone)", group: "Phone", ok: tailscale, detail: tailscale ? "Installed" : "Not installed", todo: tailscale ? undefined : "Install Tailscale on the Mac and iPhone, then run: tailscale serve 3200" });

  return { checks };
}
