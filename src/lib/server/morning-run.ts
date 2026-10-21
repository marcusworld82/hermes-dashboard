import { isPersistentMailHost, persistentMailDispatchBlock } from './persistent-mail-host.ts';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { paths } from './paths.ts';
import { getBusinessSettings, saveBusinessSettings, type BusinessSettings } from './business-settings.ts';
import { quoteDiscovery, startDiscovery, discoveryStatus, settingsHash } from './discovery.ts';
import { readLeadResearch } from './lead-research.ts';
import { openMailStore, mailStorageBlock } from './mail-queue-store.ts';
import { validateBusiness } from './mail-queue.ts';
import { createMorningStore, openMorningStore, type AutomationConsent, type MorningRecord, type MorningStep } from './morning-store.ts';
import { telegramAlertStatus } from './morning-telegram.ts';

export function morningClock(now: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, due: Number(p.hour) === 7, kind: ['Mon', 'Wed', 'Fri'].includes(p.weekday) ? 'side-hustle' as const : ['Tue', 'Thu', 'Sat'].includes(p.weekday) ? 'real-estate' as const : null };
}
export function legacyAutomation(file = path.join(paths.crmDir, 'data/studio.db')) {
  if (isPersistentMailHost()) return { batch: true, sender: !!persistentMailDispatchBlock(), error: persistentMailDispatchBlock() };
  if (!fs.existsSync(file)) return { batch: false, sender: false, error: null };
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const rows = db.prepare("SELECT k,v FROM settings WHERE k IN ('ap_batch_on','ap_send_on')").all();
    const values = Object.fromEntries(rows.map(row => [String(row.k), String(row.v)]));
    return { batch: values.ap_batch_on === '1', sender: values.ap_send_on === '1', error: null };
  } catch { return { batch: true, sender: true, error: 'Legacy CRM schedule state could not be checked. New automation stays blocked.' }; }
  finally { db?.close(); }
}
export function senderConsentHash(settings: BusinessSettings) { return crypto.createHash('sha256').update(JSON.stringify({ dailyEmailLimit: settings.dailyEmailLimit, weekendSending: settings.weekendSending, senderName: settings.senderName, businessName: settings.businessName, postalAddress: settings.postalAddress })).digest('hex'); }
export function morningConfigCheck(settings: BusinessSettings, consent: AutomationConsent | null) {
  if (!consent?.morningHash || consent.morningHash !== settingsHash(settings) || consent.capUsd !== settings.dailyScrapeCapUsd) throw Error('Morning settings changed. Review the daily cap and activate again.');
  if (!settings.services.trim() || !settings.niche.trim() || !settings.location.trim()) throw Error('Set your services, niche and location before automatic research.');
}
export async function activateMorning(input: { enabled: boolean; approvedCapUsd?: number; approveDailySpend?: boolean }) {
  if (!input.enabled) return saveBusinessSettings({ automaticMorningRun: false });
  if (isPersistentMailHost()) throw Error('This host worker supports Gmail only. Morning discovery still requires the Mac.');
  const blocked = mailStorageBlock(); if (blocked) throw Error(blocked);
  const legacy = legacyAutomation(); if (legacy.batch || legacy.error) throw Error(legacy.error || 'Turn off Daily batch in the old CRM Autopilot page before enabling this morning run. This prevents duplicate discovery.');
  const settings = getBusinessSettings();
  if (!input.approveDailySpend || input.approvedCapUsd !== settings.dailyScrapeCapUsd || settings.dailyScrapeCapUsd <= 0 || settings.dailyScrapeCapUsd > .5) throw Error('Approve the displayed daily spending cap before activation.');
  if (!settings.services.trim() || !settings.niche.trim() || !settings.location.trim()) throw Error('Set your services, niche and location first.');
  // These are read-only pricing/schema checks. No Actor run starts during activation.
  const side = await quoteDiscovery('side-hustle'), real = await quoteDiscovery('real-estate');
  if ([side, real].some(quote => quote.plan.reservedCapUsd > settings.dailyScrapeCapUsd || quote.plan.estimateUsd > settings.dailyScrapeCapUsd)) throw Error('The verified discovery plan exceeds your daily cap.');
  if (settingsHash(getBusinessSettings()) !== settingsHash(settings)) throw Error('Settings changed during preflight. Review and activate again.');
  const store = openMorningStore();
  try {
    const prior = store.get<AutomationConsent>('consent', { at: 0 });
    store.set('consent', { ...prior, at: Date.now(), morningHash: settingsHash(settings), capUsd: settings.dailyScrapeCapUsd, actors: { 'side-hustle': side.plan.actor, 'real-estate': real.plan.actor } });
    return saveBusinessSettings({ automaticMorningRun: true });
  } finally { store.close(); }
}
export function activateSender(input: { enabled: boolean; approvedDailyLimit?: number; approveApprovedEmailRelease?: boolean }) {
  if (!input.enabled) return saveBusinessSettings({ senderEnabled: false });
  const blocked = mailStorageBlock(); if (blocked) throw Error(blocked);
  const legacy = legacyAutomation(); if (legacy.sender || legacy.error) throw Error(legacy.error || 'Turn off Sending in the old CRM Autopilot page before enabling Gmail release. This prevents two senders.');
  const settings = getBusinessSettings(); validateBusiness(settings);
  if (!input.approveApprovedEmailRelease || input.approvedDailyLimit !== settings.dailyEmailLimit) throw Error('Approve the displayed daily email limit and sending window.');
  const mail = openMailStore();
  try {
    const state = mail.read();
    if (!state.account || !state.test?.verifiedAt || state.test.account !== state.account.email) throw Error('Connect Gmail and verify a self-test before enabling automatic release.');
    if (state.items.some(item => ['unknown', 'sending'].includes(item.status))) throw Error('Reconcile uncertain sends before enabling the worker.');
    const store = openMorningStore();
    try { const prior = store.get<AutomationConsent>('consent', { at: 0 }); store.set('consent', { ...prior, at: Date.now(), senderHash: senderConsentHash(settings) }); }
    finally { store.close(); }
    return saveBusinessSettings({ senderEnabled: true });
  } finally { mail.close(); }
}
export async function runMorningWith(deps: {
  now: number; settings: BusinessSettings; store: ReturnType<typeof createMorningStore>;
  discovery: (kind: 'side-hustle' | 'real-estate') => Promise<unknown>; research: () => Promise<unknown>;
}) {
  const clock = morningClock(deps.now);
  if (!deps.settings.automaticMorningRun) return { skipped: 'Morning switch is off.' };
  if (!clock.due) return { skipped: 'Outside the 7 AM hour in New York. Missed mornings are not replayed.' };
  const record: MorningRecord = { day: clock.day, claimedAt: deps.now, kind: clock.kind, steps: [] };
  if (!deps.store.claim(record)) return { skipped: 'Today already has a durable claim. No duplicate or automatic retry.' };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    let result: MorningStep;
    try { result = { name, status: 'ok', detail: name === 'lead-discovery' ? 'Discovery job started. Lead results are pending; check the saved job status.' : 'Source research finished. Individual source errors are listed in the results.', data: await fn() }; }
    catch (error) { result = { name, status: 'error', detail: error instanceof Error ? error.message : 'Step failed.' }; }
    record.steps.push(result); deps.store.update(record);
  };
  // Failures stay independent. RSS can finish even if discovery preflight fails.
  if (clock.kind) await step('lead-discovery', () => deps.discovery(clock.kind!));
  else { record.steps.push({ name: 'lead-discovery', status: 'skipped', detail: 'Sunday: no lead scrape.' }); deps.store.update(record); }
  await step('content-research', deps.research);
  record.finishedAt = Date.now(); deps.store.update(record);
  return { record };
}
export async function startMorningDiscovery(kind: 'side-hustle' | 'real-estate') {
 const store=openMorningStore();
 try {
        const settings = getBusinessSettings();
        if (!settings.automaticMorningRun) throw Error('Morning switch was turned off.');
        const consent = store.get<AutomationConsent | null>('consent', null); morningConfigCheck(settings, consent);
        const legacy = legacyAutomation(); if (legacy.batch || legacy.error) throw Error(legacy.error || 'Legacy CRM discovery is still enabled. Nothing started.');
        const quote = await quoteDiscovery(kind);
        const current = getBusinessSettings(); morningConfigCheck(current, consent);
        if (!current.automaticMorningRun || !morningClock(Date.now()).due) throw Error('Morning switch or sending hour changed during preflight. Nothing started.');
        if (quote.plan.actor !== consent?.actors?.[kind] || quote.plan.reservedCapUsd > (consent?.capUsd || 0) || quote.plan.estimateUsd > (consent?.capUsd || 0)) throw Error('Discovery Actor or cost changed beyond standing approval. Review activation again.');
        const result = startDiscovery(quote.id, quote.plan.reservedCapUsd);
        return { jobId: result.id, kind, target: quote.plan.target, reservedCapUsd: quote.plan.reservedCapUsd, note: 'Discovery started. Results and errors follow the saved discovery job.' };
 } finally {store.close();}
}
export async function runMorning(now = Date.now()) {
 const { runScheduledMorning } = await import('./morning-runtime.ts');
 return runScheduledMorning(now);
}
export function morningStatus() {
  const settings = getBusinessSettings(), blocked = mailStorageBlock(), legacy = legacyAutomation();
  if (blocked) return { settings, blocked, legacy, runs: [], rss: null, runtime: 'Cloud blocked' };
  const store = openMorningStore();
  try { const leads = readLeadResearch(); return { settings, blocked, legacy, runs: store.runs(), rss: store.get('rss', null), worker: store.get('worker', null), mailEvents: store.get('mail-events', {}), telegram: telegramAlertStatus(store), leadSummary: { checkedAt: leads.checkedAt, companies: leads.companies.length, people: leads.people.length, error: leads.error }, discovery: discoveryStatus(), runtime: isPersistentMailHost() ? 'Persistent host Gmail worker, deployment verification required' : 'Mac required', consent: store.get<AutomationConsent | null>('consent', null) }; }
  finally { store.close(); }
}
