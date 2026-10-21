import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { readNotionResearchDirect } from './notion-read-adapter.ts';
import { paths } from './paths.ts';
import { readJson, writeJson } from './store.ts';

export type ResearchRow = Record<string, unknown>;
export type ResearchBase = { id: string; notionUrl: string; name: string; stableId: string; lastEdited: string };
export type ResearchCompany = ResearchBase & {
  segment: string; leadType: string; origin: string; website: string; websiteStatus: string; websiteFindings: string;
  ecommercePlatform: string; email: string; phone: string; contactForm: string; address: string;
  owner: string; tags: string[]; reason: string; score: number | null; scoreParts: string; confidence: string;
  contactability: string; stage: string; pauseUntil: string; denialReason: string; outreachStatus: string; dateAdded: string; lastChecked: string;
  socials: Record<string, string>; peopleIds: string[]; opportunityIds: string[]; evidenceIds: string[];
  drafts: { email: string; dm: string; callScript: string; followup: string };
};
export type ResearchPerson = ResearchBase & Pick<ResearchCompany, 'stage' | 'drafts' | 'origin' | 'tags' | 'reason' | 'socials' | 'dateAdded' | 'scoreParts' | 'pauseUntil' | 'denialReason'> & { title: string; email: string; phone: string; linkedIn: string; location: string; decisionRole: string; employmentVerification: string; roleEvidenceUrl: string; lastVerified: string; confidence: string; companyIds: string[]; evidenceIds: string[]; opportunityIds: string[] };
export type ResearchOpportunity = ResearchBase & { type: string; platform: string; sourceUrl: string; postedDate: string; observedDate: string; finding: string; reason: string; service: string; confidence: string; status: string; companyIds: string[]; peopleIds: string[]; evidenceIds: string[] };
export type ResearchEvidence = ResearchBase & { type: string; platform: string; sourceUrl: string; observation: string; quote: string; observedDate: string; confidence: string; companyIds: string[]; peopleIds: string[]; opportunityIds: string[] };
export type ResearchRun = ResearchBase & { started: string; ended: string; segment: string; mode: string; results: number | null; newRecords: number | null; costUsd: number | null; errors: string; checkpoint: string; runIds: string };
export type LeadResearchCache = { companies: ResearchCompany[]; people: ResearchPerson[]; opportunities: ResearchOpportunity[]; evidence: ResearchEvidence[]; runLog: ResearchRun[]; checkedAt: string | null; attemptedAt: string | null; error: string | null };
const EMPTY: LeadResearchCache = { companies: [], people: [], opportunities: [], evidence: [], runLog: [], checkedAt: null, attemptedAt: null, error: null };
export const LEAD_REFRESH_MS = 30 * 60_000;
const FAILURE = 'Lead Research could not refresh. Check the Marcus OS Notion connection and share the Lead Research page with it. The last good copy is preserved.';

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(text).join(', ');
  if (typeof value === 'object') {
    const v = value as ResearchRow;
    return text(v.plain_text ?? v.content ?? v.name ?? v.start ?? v.title ?? v.rich_text ?? v.select ?? v.status ?? v.date ?? v.url ?? v.email ?? v.phone_number ?? '');
  }
  return '';
}
function field(row: ResearchRow, key: string) { return text(row[key]); }
function date(row: ResearchRow, key: string) { return field(row, `date:${key}:start`) || field(row, key); }
function number(row: ResearchRow, key: string): number | null {
  const raw = row[key];
  if (raw == null || raw === '') return null;
  const n = Number(typeof raw === 'object' ? (raw as ResearchRow).number : raw);
  return Number.isFinite(n) ? n : null;
}
function ids(value: unknown): string[] {
  return [...new Set((JSON.stringify(value ?? '').match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32}/gi) ?? []).map(v => v.replaceAll('-', '').toLowerCase()))];
}
function tags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean); } catch {}
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}
export function safeResearchUrl(value: string) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function base(r: ResearchRow, title = 'Name'): ResearchBase {
  const notionUrl = safeResearchUrl(field(r, 'url'));
  const id = ids(r.url ?? r.id)[0];
  if (!id || !notionUrl || !['notion.so', 'www.notion.so', 'app.notion.com', 'notion.com', 'www.notion.com'].includes(new URL(notionUrl).hostname)) throw Error('Invalid Notion row');
  return { id, notionUrl, name: field(r, title), stableId: field(r, 'Stable ID'), lastEdited: field(r, 'Last Edited') || field(r, 'last_edited_time') };
}
function rows(result: ResearchRow, key: string): ResearchRow[] {
  const value = result[key];
  if (!Array.isArray(value) || value.some(v => !v || typeof v !== 'object' || Array.isArray(v))) throw Error('Incomplete Lead Research snapshot');
  return value;
}
export function mapLeadResearch(result: ResearchRow): Omit<LeadResearchCache, 'checkedAt' | 'attemptedAt' | 'error'> {
  if (result.ok !== true) throw Error(result.code === 'rate_limited' ? 'rate_limited' : FAILURE);
  return {
    companies: rows(result, 'companies').map(r => ({ ...base(r), segment: field(r, 'Segment'), leadType: field(r, 'Entity Type'), origin: field(r, 'Lead Origin'), website: safeResearchUrl(field(r, 'Website')), websiteStatus: field(r, 'Website Status'), websiteFindings: field(r, 'Website Findings'), ecommercePlatform: field(r, 'Ecommerce Platform'), email: field(r, 'General Business Email'), phone: field(r, 'General Business Phone'), contactForm: safeResearchUrl(field(r, 'Contact Form')), address: field(r, 'Address'), owner: field(r, 'Owner or Decision Maker'), tags: [...new Set([...tags(r['Tags']), ...tags(r['Why Tags'])])], reason: field(r, 'Reason') || field(r, 'Opportunity Summary'), score: number(r, 'Priority Score'), scoreParts: field(r, 'Score Parts'), confidence: field(r, 'Confidence'), contactability: field(r, 'Contactability'), stage: field(r, 'Stage'), pauseUntil: date(r, 'Pause Until'), denialReason: field(r, 'Denial Reason'), outreachStatus: field(r, 'Outreach Status'), dateAdded: date(r, 'First Found') || field(r, 'createdTime'), lastChecked: date(r, 'Last Checked'), socials: Object.fromEntries(['Instagram', 'Facebook', 'LinkedIn Company URL', 'TikTok', 'YouTube', 'X'].map(k => [k, safeResearchUrl(field(r, k))])), peopleIds: ids(r.People), opportunityIds: ids(r.Opportunities), evidenceIds: ids(r.Evidence), drafts: { email: field(r, 'Draft Email'), dm: field(r, 'Draft DM'), callScript: field(r, 'Draft Call Script'), followup: field(r, 'Draft Follow-up') } })),
    people: rows(result, 'people').map(r => ({ ...base(r), stage: field(r, 'Stage'), pauseUntil: date(r, 'Pause Until'), denialReason: field(r, 'Denial Reason'), drafts: { email: field(r, 'Draft Email'), dm: field(r, 'Draft DM'), callScript: field(r, 'Draft Call Script'), followup: field(r, 'Draft Follow-up') }, origin: field(r, 'Lead Origin'), tags: tags(r['Why Tags']), reason: field(r, 'Reason'), socials: Object.fromEntries(['TikTok', 'YouTube', 'X'].map(k => [k, safeResearchUrl(field(r, k))])), dateAdded: field(r, 'createdTime'), scoreParts: field(r, 'Score Parts'), title: field(r, 'Current Title'), email: field(r, 'Public Individual Business Email'), phone: field(r, 'Public Direct Business Phone'), linkedIn: safeResearchUrl(field(r, 'LinkedIn Profile URL')), location: field(r, 'Published Professional Location'), decisionRole: field(r, 'Decision Role'), employmentVerification: field(r, 'Employment Verification Status'), roleEvidenceUrl: safeResearchUrl(field(r, 'Role Evidence URL')), lastVerified: date(r, 'Last Verified'), confidence: field(r, 'Confidence'), companyIds: ids(r.Company), evidenceIds: ids(r['Related Evidence']), opportunityIds: ids(r['Related Opportunities']) })),
    opportunities: rows(result, 'opportunities').map(r => ({ ...base(r), type: field(r, 'Opportunity Type'), platform: field(r, 'Source Platform'), sourceUrl: safeResearchUrl(field(r, 'Source URL')), postedDate: date(r, 'Posted Date'), observedDate: date(r, 'Observed Date'), finding: field(r, 'Supporting Quote or Finding'), reason: field(r, 'Why It Fits'), service: field(r, 'Suggested Service'), confidence: field(r, 'Confidence'), status: field(r, 'Status'), companyIds: ids(r.Company), peopleIds: ids(r.People), evidenceIds: ids(r.Evidence) })),
    evidence: rows(result, 'evidence').map(r => ({ ...base(r, 'Title'), type: field(r, 'Evidence Type'), platform: field(r, 'Source Platform'), sourceUrl: safeResearchUrl(field(r, 'Source URL')), observation: field(r, 'Observation'), quote: field(r, 'Short Quote'), observedDate: date(r, 'Observed Date'), confidence: field(r, 'Confidence'), companyIds: ids(r.Companies), peopleIds: ids(r.People), opportunityIds: ids(r.Opportunities) })),
    runLog: rows(result, 'runLog').map(r => ({ ...base(r, 'Run Name'), started: date(r, 'Started'), ended: date(r, 'Ended'), segment: field(r, 'Segment'), mode: field(r, 'Mode'), results: number(r, 'Results Found'), newRecords: number(r, 'New Records'), costUsd: number(r, 'Cost USD'), errors: field(r, 'Errors'), checkpoint: field(r, 'Checkpoint'), runIds: field(r, 'Run IDs') })),
  };
}
export function shouldRefreshLeadResearch(prior: Pick<LeadResearchCache, 'attemptedAt'>, force = false, now = Date.now()) {
  return force || !prior.attemptedAt || !Number.isFinite(Date.parse(prior.attemptedAt)) || now - Date.parse(prior.attemptedAt) >= LEAD_REFRESH_MS;
}
export function summarizeLeadResearch(cache: LeadResearchCache, now = new Date()) {
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).format(now);
  const runs = cache.runLog.filter(r => { const d = new Date(r.started); return Number.isFinite(d.getTime()) && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).format(d) === month; });
  return { ...cache, counts: { companies: cache.companies.length, people: cache.people.length, opportunities: cache.opportunities.length, newToReview: cache.companies.filter(c => !['Do not contact', 'Denied'].includes(c.stage || c.outreachStatus) && (!c.stage || c.stage === 'New') && ['', 'Not started', 'Needs review'].includes(c.outreachStatus)).length, bySegment: cache.companies.reduce<Record<string, number>>((out, c) => { out[c.segment || 'Unknown'] = (out[c.segment || 'Unknown'] || 0) + 1; return out; }, {}), monthCostUsd: runs.reduce((n, r) => n + (r.costUsd ?? 0), 0), monthUnknownCosts: runs.filter(r => r.costUsd === null).length } };
}
export function readLeadResearch() { return summarizeLeadResearch(readJson<LeadResearchCache>('lead-research-live', EMPTY)); }
const exec = promisify(execFile);
async function runReader() {
  if (process.env.HERMES_DEPLOYMENT_MODE === 'persistent-host') return readNotionResearchDirect();
  const runtime = await exec(paths.hermesBin, ['--print-runtime-command'], { timeout: 10_000 });
  const [python] = JSON.parse(runtime.stdout);
  const result = await exec(python, ['-I', path.join(process.cwd(), 'scripts/lead-research.py')], { timeout: 120_000, maxBuffer: 15_000_000 });
  return JSON.parse(result.stdout.trim().split('\n').at(-1)!);
}
// Dependency injection keeps failure, throttling, and concurrency tests off the live connection.
export function createLeadResearchRefresher(deps: { read: () => LeadResearchCache; write: (state: LeadResearchCache) => void; run: () => Promise<ResearchRow>; now: () => number }) {
  let busy = false;
  return async (force = false) => {
    const prior = deps.read();
    if (busy || !shouldRefreshLeadResearch(prior, force, deps.now())) return { skipped: true, ...summarizeLeadResearch(prior) };
    busy = true;
    const attemptedAt = new Date(deps.now()).toISOString();
    try {
      deps.write({ ...prior, attemptedAt });
      const mapped = mapLeadResearch(await deps.run());
      const next = { ...mapped, attemptedAt, checkedAt: new Date(deps.now()).toISOString(), error: null };
      deps.write(next);
      return { skipped: false, ...summarizeLeadResearch(next) };
    } catch (error) {
      const message = error instanceof Error && error.message === 'rate_limited' ? 'Notion query allowance is exhausted. Wait for it to reset. The last good copy is preserved.' : process.env.HERMES_DEPLOYMENT_MODE === 'persistent-host' ? 'Lead Research could not refresh. Check the host Notion token and access to all five Lead Research data sources. The last good copy is preserved.' : FAILURE;
      const next = { ...prior, attemptedAt, error: message };
      deps.write(next);
      return { skipped: false, ...summarizeLeadResearch(next) };
    } finally { busy = false; }
  };
}
export const refreshLeadResearch = createLeadResearchRefresher({ read: () => readJson<LeadResearchCache>('lead-research-live', EMPTY), write: state => writeJson('lead-research-live', state), run: runReader, now: Date.now });
