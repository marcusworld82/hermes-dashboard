import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { paths } from "./paths.ts";
import { requireRuns } from "./settings.ts";
import { withAgentRun } from "./agent-controls.ts";

// Social Studio: one button per Instagram or LinkedIn skill. A button asks the hermes CLI to draft,
// the draft waits for Marcus to approve it, and only then does it go to the Metricool automation.
// Nothing here posts by itself.

export type StudioSkill = { id: string; label: string; platform: "instagram" | "linkedin" | "research"; skill: string; ask: string; publishable: boolean };
export const STUDIO_SKILLS: StudioSkill[] = [
  { id: "ig-carousel", label: "Carousel", platform: "instagram", skill: "ig-carousel", ask: "Build an Instagram carousel", publishable: true },
  { id: "ig-reel", label: "Reel script", platform: "instagram", skill: "ig-reel", ask: "Write an Instagram Reel script and caption", publishable: true },
  { id: "ig-caption", label: "Caption", platform: "instagram", skill: "ig-caption", ask: "Write an Instagram caption", publishable: true },
  { id: "ig-story", label: "Story", platform: "instagram", skill: "ig-story", ask: "Write an Instagram Story sequence", publishable: true },
  { id: "ig-plan", label: "Plan the week", platform: "instagram", skill: "ig-plan", ask: "Plan my Instagram week", publishable: false },
  { id: "ig-viral", label: "What is working", platform: "instagram", skill: "ig-viral", ask: "Find which Instagram formulas are landing in this niche", publishable: false },
  { id: "li-post", label: "Post", platform: "linkedin", skill: "li-post", ask: "Write a LinkedIn post", publishable: true },
  { id: "li-carousel", label: "Carousel", platform: "linkedin", skill: "li-carousel", ask: "Write a LinkedIn document carousel", publishable: true },
  { id: "li-comment", label: "Comment", platform: "linkedin", skill: "li-comment", ask: "Write a LinkedIn comment", publishable: false },
  { id: "li-repurpose", label: "Repurpose", platform: "linkedin", skill: "li-repurpose", ask: "Turn this into a week of LinkedIn posts", publishable: false },
  { id: "li-plan", label: "Plan the week", platform: "linkedin", skill: "li-plan", ask: "Plan my LinkedIn week", publishable: false },
  { id: "competitors", label: "Competitor watch", platform: "research", skill: "last30days", ask: "Research what these competitors have publicly posted on Instagram and LinkedIn in the last 30 days, and what is working for them. Public posts only. No private data, no logins.", publishable: false },
  { id: "research", label: "Last 30 days", platform: "research", skill: "last30days", ask: "Research what people are saying about this topic in the last 30 days", publishable: false },
];

export type DraftStatus = "drafting" | "ready" | "approved" | "sent" | "uncertain" | "failed";
export type Draft = { id: string; skillId: string; platform: StudioSkill["platform"]; brief: string; researchFirst: boolean; status: DraftStatus; output: string; error?: string; createdAt: string; updatedAt: string; scheduledFor?: string };

const dir = () => path.join(paths.data, "social-studio");
const file = () => path.join(dir(), "drafts.json");
function readAll(): Draft[] {
  try { return JSON.parse(fs.readFileSync(file(), "utf8")) as Draft[]; } catch { return []; }
}
function writeAll(list: Draft[]) {
  fs.mkdirSync(dir(), { recursive: true, mode: 0o700 });
  const tmp = file() + "." + randomUUID() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list.slice(0, 200), null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file());
}
function update(id: string, patch: Partial<Draft>) {
  const list = readAll();
  const i = list.findIndex((d) => d.id === id);
  if (i < 0) throw new Error("Draft not found.");
  list[i] = { ...list[i], ...patch, updatedAt: new Date().toISOString() };
  writeAll(list);
  return list[i];
}

export function listDrafts() {
  // A draft still "drafting" after a restart has no process behind it.
  const stale = Date.now() - 10 * 60_000;
  return readAll().map((d) => (d.status === "drafting" && Date.parse(d.updatedAt) < stale ? { ...d, status: "failed" as const, error: "The draft stopped before it finished. Try again." } : d));
}

function promptFor(s: StudioSkill, brief: string, researchFirst: boolean) {
  const rules = [
    "Write only. Do not post, send, schedule, DM, comment or publish anything anywhere, and do not log in to any account.",
    "No em dashes. Plain words. Start with the content, no preamble.",
  ];
  if (s.platform === "instagram") rules.push("Follow the specs in Wiki/Social Media.md in the Obsidian vault at ~/Documents/second-brain: size and safe zone for the format, a hook from the hook list, one of the 7 carousel structures if it is a carousel, and the 3-color rule. Say plainly if a spec cannot be met.");
  if (s.platform === "linkedin") rules.push("Run the draft through the li-human humanizer before returning it.");
  const research = researchFirst && s.id !== "research" && s.id !== "competitors" ? "First use the last30days skill on the topic and write from what it finds. List the sources at the end.\n" : "";
  return `${s.ask}.\n${research}${rules.join("\n")}\n\nBrief:\n${brief}`;
}

export function startDraft(input: { skillId?: unknown; brief?: unknown; researchFirst?: unknown }) {
  requireRuns();
  const s = STUDIO_SKILLS.find((x) => x.id === input.skillId);
  if (!s) throw new Error("Choose one of the buttons.");
  const brief = typeof input.brief === "string" ? input.brief.trim() : "";
  if (!brief || brief.length > 4000) throw new Error("Write a brief of up to 4,000 characters.");
  const now = new Date().toISOString();
  const draft: Draft = { id: randomUUID(), skillId: s.id, platform: s.platform, brief, researchFirst: input.researchFirst === true, status: "drafting", output: "", createdAt: now, updatedAt: now };
  writeAll([draft, ...readAll()]);
  void runDraft(draft, s);
  return draft;
}

async function runDraft(draft: Draft, s: StudioSkill) {
  try {
    const out = await withAgentRun("social", { operation: `Social Studio: ${s.label}`, billing: "unknown" }, async () => {
      const text = await new Promise<string>((resolve, reject) => {
        execFile(paths.hermesBin, ["-z", promptFor(s, draft.brief, draft.researchFirst), "--skills", s.skill], { timeout: 8 * 60_000, maxBuffer: 2_000_000 }, (err, stdout) => (err ? reject(new Error("The agent could not finish this draft. Try again.")) : resolve(stdout.trim())));
      });
      return { value: text, lastMessage: `${s.label} drafted` };
    });
    if (!out) throw new Error("The agent returned nothing. Try again.");
    update(draft.id, { status: "ready", output: out });
  } catch (e) {
    update(draft.id, { status: "failed", error: (e as Error).message });
  }
}

export function editDraft(id: string, output: unknown) {
  const d = readAll().find((x) => x.id === id);
  if (!d || !["ready", "approved"].includes(d.status)) throw new Error("This draft cannot be edited now.");
  if (typeof output !== "string" || !output.trim() || output.length > 20000) throw new Error("Draft text is empty or too long.");
  return update(id, { output: output.trim(), status: "ready" });
}

export function approveDraft(id: string, scheduledFor?: unknown) {
  const d = readAll().find((x) => x.id === id);
  if (!d || d.status !== "ready") throw new Error("Only a ready draft can be approved.");
  let when: string | undefined;
  if (typeof scheduledFor === "string" && scheduledFor) {
    const t = Date.parse(scheduledFor);
    if (!Number.isFinite(t) || t < Date.now()) throw new Error("Pick a time in the future.");
    when = new Date(t).toISOString();
  }
  return update(id, { status: "approved", scheduledFor: when });
}

export function metricoolConnected() {
  return /^https:\/\/[^\s]+$/.test(process.env.METRICOOL_WEBHOOK_URL ?? "");
}

// Sends one approved draft to the Make or Zapier scenario that feeds Metricool.
// A network failure after sending leaves the result unknown, so it is never retried by itself.
export async function publishDraft(id: string) {
  const d = readAll().find((x) => x.id === id);
  const s = STUDIO_SKILLS.find((x) => x.id === d?.skillId);
  if (!d || !s || d.status !== "approved") throw new Error("Approve the draft first.");
  if (!s.publishable) throw new Error("This kind of draft is not published. It is for you to read and use.");
  if (!metricoolConnected()) throw new Error("The Metricool automation is not connected yet. Add METRICOOL_WEBHOOK_URL to .env.local.");
  update(id, { status: "uncertain" });
  try {
    const res = await fetch(process.env.METRICOOL_WEBHOOK_URL as string, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId: d.id, platform: d.platform, kind: d.skillId, text: d.output, scheduledFor: d.scheduledFor ?? null }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return update(id, { status: "approved", error: `The automation refused it (${res.status}). Nothing was published.` });
    return update(id, { status: "sent", error: undefined });
  } catch {
    return update(id, { status: "uncertain", error: "The automation did not answer. Check Metricool before sending again." });
  }
}
