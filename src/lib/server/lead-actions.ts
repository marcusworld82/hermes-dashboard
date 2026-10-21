import { assertLegacyOutreachAllowed } from './legacy-outreach-guard.ts';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { paths } from './paths.ts';
import { readLeadResearch, refreshLeadResearch, mapLeadResearch } from './lead-research.ts';
import type { LeadResearchCache, ResearchRow, ResearchCompany, ResearchPerson } from './lead-research.ts';
import { suppressEmail, normalizeEmail } from './mail-queue.ts';
import type { LeadEmailSnapshot } from './mail-queue.ts';
import { openMailStore } from './mail-queue-store.ts';

export type UnifiedLead = {
  id: string; entity: 'companies' | 'people'; name: string; business: string; owner: string; title: string; email: string; phone: string;
  address: string; dateAdded: string; website: string; websiteStatus: string; origin: string; segment: string; tags: string[];
  reason: string; score: number | null; scoreParts: string; confidence: string; contactability: string; stage: string; pauseUntil: string; denialReason: string; doNotContact: boolean;
  notionUrl: string; socials: Record<string, string>; drafts: { email: string; dm: string; callScript: string; followup: string }; lastEdited: string;
  revision: string; evidenceIds: string[]; companyIds: string[];
};
export const LEAD_STAGES = ['New', 'Ready to send', 'Paused', 'Sent', 'Replied', 'Meeting', 'Client', 'Denied', 'Do not contact'];
function revision(lead: Omit<UnifiedLead, 'revision'>) {
  return crypto.createHash('sha256').update(JSON.stringify({ id: lead.id, email: lead.email, stage: lead.stage, pauseUntil: lead.pauseUntil, denialReason: lead.denialReason, doNotContact: lead.doNotContact, drafts: lead.drafts, lastEdited: lead.lastEdited })).digest('hex');
}
export function effectiveLeadStage(stage: string, pauseUntil: string, now = Date.now()) { return stage === 'Paused' && pauseUntil && Number.isFinite(Date.parse(pauseUntil)) && Date.parse(pauseUntil) <= now ? 'New' : stage; }
function unifiedCompany(c: ResearchCompany): UnifiedLead {
  const lead = { id: `companies:${c.id}`, entity: 'companies' as const, name: c.owner, business: c.name, owner: c.owner, title: '', email: c.email, phone: c.phone, address: c.address, dateAdded: c.dateAdded, website: c.website, websiteStatus: c.websiteStatus, origin: c.origin, segment: c.segment, tags: c.tags, reason: c.reason, score: c.score, scoreParts: c.scoreParts, confidence: c.confidence, contactability: c.contactability, pauseUntil: c.pauseUntil, denialReason: c.denialReason, stage: effectiveLeadStage(c.stage, c.pauseUntil) || (c.outreachStatus === 'Do not contact' ? 'Do not contact' : 'New'), doNotContact: c.stage === 'Do not contact' || c.outreachStatus === 'Do not contact' || c.stage === 'Denied', notionUrl: c.notionUrl, socials: c.socials, drafts: c.drafts, lastEdited: c.lastEdited, evidenceIds: c.evidenceIds, companyIds: [c.id] };
  return { ...lead, revision: revision(lead) };
}
function unifiedPerson(p: ResearchPerson, companies: ResearchCompany[]): UnifiedLead {
  const parents = companies.filter(c => p.companyIds.includes(c.id) || c.peopleIds.includes(p.id));
  const company = parents.length === 1 ? parents[0] : null;
  const suppressed = parents.some(c => ['Denied', 'Do not contact'].includes(c.stage) || c.outreachStatus === 'Do not contact');
  const lead = { id: `people:${p.id}`, entity: 'people' as const, name: p.name, business: parents.map(c => c.name).join(', '), owner: p.name, title: p.title, email: p.email, phone: p.phone, address: p.location, dateAdded: p.dateAdded, website: company?.website ?? '', websiteStatus: company?.websiteStatus ?? '', origin: p.origin, segment: company?.segment ?? '', tags: p.tags, reason: p.reason, score: null, scoreParts: p.scoreParts, confidence: p.confidence, contactability: p.email ? 'Individual business email' : p.phone ? 'Direct business phone' : p.linkedIn ? 'Social only' : 'None found', pauseUntil: p.pauseUntil, denialReason: p.denialReason, stage: effectiveLeadStage(p.stage, p.pauseUntil) || 'New', doNotContact: suppressed || ['Denied', 'Do not contact'].includes(p.stage), notionUrl: p.notionUrl, socials: { ...p.socials, LinkedIn: p.linkedIn }, drafts: p.drafts, lastEdited: p.lastEdited, evidenceIds: p.evidenceIds, companyIds: p.companyIds };
  return { ...lead, revision: revision(lead) };
}
export function unifyLeads(cache: LeadResearchCache): UnifiedLead[] {
  return [...cache.companies.map(unifiedCompany), ...cache.people.map(p => unifiedPerson(p, cache.companies))];
}
export function readUnifiedLeads() {
  const cache = readLeadResearch();
  return { ...cache, leads: unifyLeads(cache) };
}
export function splitLeadId(id: string) {
  const match = /^(companies|people):([a-f0-9]{32})$/.exec(id);
  if (!match) throw Error('Choose a lead from the master list.');
  return { db: match[1] as 'companies' | 'people', id: match[2] };
}
const exec = promisify(execFile);
export async function runLeadMaster(payload: Record<string, unknown>): Promise<ResearchRow> {
  const runtime = await exec(paths.hermesBin, ['--print-runtime-command'], { timeout: 10_000 });
  const [python] = JSON.parse(runtime.stdout);
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-I', path.join(process.cwd(), 'scripts/lead-research-write.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', settled = false;
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(Error('Notion did not confirm the operation in time. Refresh before retrying.')); }, 590_000);
    function finish(error?: Error, result?: ResearchRow) { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(result!); }
    child.on('error', () => finish(Error('The Notion runtime is unavailable.')));
    child.stdin.on('error', () => finish(Error('The Notion runtime did not accept the request.')));
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 15_000_000) { child.kill('SIGTERM'); finish(Error('Notion returned too much data.')); } });
    // Drain stderr without exposing runtime credentials or connector details.
    child.stderr.on('data', () => {});
    child.on('close', code => {
      if (code !== 0) return finish(Error('Notion did not confirm the operation.'));
      try { const result = JSON.parse(stdout.trim().split('\n').at(-1)!); if (result.ok !== true) throw Error('Notion did not confirm the operation. Refresh before retrying.'); finish(undefined, result); }
      catch { finish(Error('Notion did not confirm the operation. Refresh before retrying.')); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
export async function preflightLeadResearchWrite() { return runLeadMaster({ action: 'preflight' }); }
export async function syncLeadResearchRecords(records: Record<string, unknown>) {
  const result = await runLeadMaster({ action: 'sync', records });
  const cache = await refreshLeadResearch(true);
  if (cache.error) throw Error('Notion saved the records, but the dashboard read failed. Refresh Notion to show the master list.');
  return result;
}
async function freshLead(id: string) {
  const key = splitLeadId(id);
  const result = await runLeadMaster({ action: 'snapshot', ...key });
  const row = result.row as ResearchRow;
  if (!row || !Array.isArray(result.parents)) throw Error('Notion did not confirm a fresh lead.');
  const mapped = mapLeadResearch({ ok: true, companies: key.db === 'companies' ? [row] : result.parents, people: key.db === 'people' ? [row] : [], opportunities: [], evidence: [], runLog: [] });
  const lead = key.db === 'companies' ? unifiedCompany(mapped.companies[0]) : unifiedPerson(mapped.people[0], mapped.companies);
  return { lead, row, key };
}
export async function getFreshLeadSnapshot(id: string): Promise<UnifiedLead> { return (await freshLead(id)).lead; }
export function parseLeadEmail(text: string) {
  const match = /^Subject:\s*([^\r\n]+)\r?\n+([\s\S]+)$/i.exec(text.trim());
  if (!match || !match[1].trim() || !match[2].trim()) throw Error('Save an email with Subject: on its first line, followed by the message.');
  return { subject: match[1].trim(), body: match[2].trim() };
}
export function emailSnapshotFromLead(lead: UnifiedLead, kind: 'first' | 'followup' = 'first'): LeadEmailSnapshot {
  const draft = parseLeadEmail(kind === 'followup' ? lead.drafts.followup : lead.drafts.email);
  return { id: lead.id, email: lead.email, stage: lead.stage, doNotContact: lead.doNotContact, ...draft, revision: lead.revision };
}
export async function getLeadEmailSnapshot(id: string, kind: 'first' | 'followup' = 'first'): Promise<LeadEmailSnapshot> {
  const lead = (await freshLead(id)).lead;
  assertLegacyOutreachAllowed(lead, kind);
  return emailSnapshotFromLead(lead, kind);
}
export async function updateLead(id: string, expectedRevision: string, change: { stage?: string; pauseUntil?: string; denialReason?: string; draftType?: 'email' | 'dm' | 'callScript' | 'followup'; draft?: string }, internal?: { deliveryEvent: 'bounce' }) {
  const { lead, row, key } = await freshLead(id);
  if (!expectedRevision || lead.revision !== expectedRevision) throw Error('This lead changed in Notion. Refresh and review the new version.');
  const properties: Record<string, string | number | null> = {};
  if (change.stage !== undefined) {
    if (!LEAD_STAGES.includes(change.stage)) throw Error('Choose a valid lead stage.');
    if (lead.doNotContact && !['Denied', 'Do not contact'].includes(change.stage)) throw Error('This contact stays suppressed.');
    properties.Stage = change.stage;
    if (change.stage === 'Paused' && internal?.deliveryEvent === 'bounce') {
      properties['date:Pause Until:start'] = null;
    } else if (change.stage === 'Paused') {
      if (typeof change.pauseUntil !== 'string' || !Number.isFinite(Date.parse(change.pauseUntil)) || Date.parse(change.pauseUntil) <= Date.now() || Date.parse(change.pauseUntil) > Date.now() + 366 * 86400000) throw Error('Choose a future pause date within one year.');
      properties['date:Pause Until:start'] = new Date(change.pauseUntil).toISOString(); properties['date:Pause Until:is_datetime'] = 1;
    }
    if (change.stage === 'Denied') {
      if (typeof change.denialReason !== 'string' || !change.denialReason.trim() || change.denialReason.length > 2000) throw Error('Give a short reason for denying this lead.');
      properties['Denial Reason'] = change.denialReason.trim();
    }
  }
  if (change.draftType !== undefined) {
    const property = { email: 'Draft Email', dm: 'Draft DM', callScript: 'Draft Call Script', followup: 'Draft Follow-up' }[change.draftType];
    if (!property || typeof change.draft !== 'string' || change.draft.length > 20000) throw Error('Enter a draft of at most 20,000 characters.');
    if (['email', 'followup'].includes(change.draftType) && change.draft.trim()) parseLeadEmail(change.draft);
    properties[property] = change.draft;
  }
  if (!Object.keys(properties).length) throw Error('Choose a change.');
  const expected = Object.fromEntries(['Last Edited', 'Stage', 'Draft Email', 'Draft DM', 'Draft Call Script', 'Draft Follow-up', 'date:Pause Until:start', 'Denial Reason'].map(k => [k, row[k] ?? null]));
  const result = await runLeadMaster({ action: 'update', ...key, properties, expected });
  if (change.stage && ['Denied', 'Do not contact', 'Paused', 'Sent'].includes(change.stage)) {
    const store = openMailStore();
    try {
      if (['Denied', 'Do not contact'].includes(change.stage) && lead.email) {
        let email = ''; try { email = normalizeEmail(lead.email); } catch {}
        if (email) suppressEmail(store, email, change.stage === 'Denied' ? 'Not interested' : 'Do not contact');
      }
      store.transaction(state => { for (const item of state.items) if (item.leadId === lead.id && ['queued', 'paused'].includes(item.status)) { item.status = 'cancelled'; item.error = `Lead marked ${change.stage} in Notion.`; } });
    } finally { store.close(); }
  }
  const cache = await refreshLeadResearch(true);
  return { ok: true, result, cacheError: cache.error };
}
