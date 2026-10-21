import crypto from 'node:crypto';
import type { MailStore, MailState, MailItem } from './mail-queue-store.ts';

export type MailBusinessSettings = { dailyEmailLimit: number; weekendSending: boolean; senderName: string; businessName: string; postalAddress: string };
export type LeadEmailSnapshot = { id: string; email: string; stage: string; doNotContact: boolean; subject: string; body: string; revision: string };
export type LeadEmailResolver = (id: string, kind?: 'first' | 'followup') => Promise<LeadEmailSnapshot> | LeadEmailSnapshot;
export const OPT_OUT = 'If you do not want another email from me, reply "no thanks".';
export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email) || /[\r\n]/.test(email)) throw Error('A valid public business email is required.');
  return email;
}
export function sendingWindow(now: number, weekends: boolean) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { day: `${p.year}-${p.month}-${p.day}`, allowed: Number(p.hour) >= 9 && Number(p.hour) < 21 && (weekends || !['Sat', 'Sun'].includes(p.weekday)) };
}
export function validateBusiness(settings: MailBusinessSettings) {
  if (![settings.senderName, settings.businessName, settings.postalAddress].every(s => typeof s === 'string' && s.trim())) throw Error('Add your real sender name, business name and postal address in Business settings first.');
  if (!Number.isInteger(settings.dailyEmailLimit) || settings.dailyEmailLimit < 1 || settings.dailyEmailLimit > 30) throw Error('Daily email limit must be between 1 and 30.');
}
export function exactEmailDraft(lead: LeadEmailSnapshot, settings: MailBusinessSettings) {
  validateBusiness(settings);
  const email = normalizeEmail(lead.email), subject = lead.subject.trim(), text = lead.body.trim();
  if (!subject || /[\r\n]/.test(subject) || subject.length > 200 || !text || text.length > 20000) throw Error('A complete subject and email draft are required.');
  const body = `${text}\n\n${settings.senderName.trim()}\n${settings.businessName.trim()}\n${settings.postalAddress.trim()}\n\n${OPT_OUT}`;
  const draftHash = crypto.createHash('sha256').update(JSON.stringify({ id: lead.id, email, subject, body, revision: lead.revision })).digest('hex');
  return { email, subject, body, draftHash };
}
export function eligibleLead(lead: LeadEmailSnapshot, kind: 'first' | 'followup' = 'first') {
  if (kind === 'first' && lead.stage.toLowerCase() === 'sent') throw Error('This lead is already marked Sent. A first email cannot send again.');
  if (lead.doNotContact || ['do not contact', 'denied', 'replied', 'paused', 'bounced'].includes(lead.stage.toLowerCase())) throw Error('This lead is paused, denied, replied, bounced or marked Do not contact.');
}
export function pauseMail(state: MailState, reason: string, now = Date.now()) {
  if (!state.paused || state.pauseReason !== reason) state.notices.push({ id: crypto.randomUUID(), at: now, text: reason });
  state.paused = true; state.pauseReason = reason;
}
export function approveEmail(store: MailStore, lead: LeadEmailSnapshot, settings: MailBusinessSettings, approvedHash: string, kind: 'first' | 'followup' = 'first', now = Date.now()) {
  eligibleLead(lead, kind);
  const draft = exactEmailDraft(lead, settings);
  if (approvedHash !== draft.draftHash) throw Error('The draft changed. Review the current complete email before approving it.');
  return store.transaction(state => {
    if (!state.account || state.test?.account !== state.account.email || !state.test.verifiedAt) throw Error('Send and verify a test to your own inbox before approving lead emails.');
    if (state.suppressed[draft.email]) throw Error(`Contact is suppressed: ${state.suppressed[draft.email]}`);
    const prior = state.items.filter(item => item.email === draft.email || item.leadId === lead.id);
    if (prior.some(item => item.kind === kind && item.status !== 'cancelled')) throw Error('This contact already has this email step queued or sent.');
    if (prior.some(item => item.replyAt || item.bouncedAt)) throw Error('This contact replied or bounced. The sequence is stopped.');
    const first = prior.find(item => item.kind === 'first' && item.status === 'sent' && item.sentAt);
    if (kind === 'followup' && !first) throw Error('A follow-up needs a confirmed first email.');
    const item: MailItem = { id: crypto.randomUUID(), leadId: lead.id, ...draft, revision: lead.revision, approvedAt: now, status: 'queued', kind, parentId: first?.id, notBefore: kind === 'followup' ? first!.sentAt! + 4 * 86400000 : now, messageId: `<${crypto.randomUUID()}@hermes.local>` };
    state.items.push(item); return item;
  });
}
export function releaseBlock(state: MailState, settings: MailBusinessSettings, now: number) {
  if (state.paused) return state.pauseReason || 'Queue paused.';
  if (!state.account || state.test?.account !== state.account.email || !state.test.verifiedAt) return 'A verified self-test is required.';
  if (!state.account.lastPollAt || now - state.account.lastPollAt > 120000 || state.account.pollError) return 'Reply checks must succeed before sending.';
  if (state.leaseUntil > now) return 'A release is already running.';
  if (state.items.some(item => item.status === 'sending' || item.status === 'unknown')) return 'An earlier send needs reconciliation. No automatic retry.';
  if (state.nextReleaseAt > now) return 'Waiting for the 12 minute gap plus jitter.';
  const window = sendingWindow(now, settings.weekendSending);
  if (!window.allowed) return 'Outside the 9 AM to 9 PM New York sending window.';
  const sentToday = state.items.filter(item => item.attemptedAt && sendingWindow(item.attemptedAt, true).day === window.day && ['sent', 'sending', 'unknown'].includes(item.status)).length;
  if (sentToday >= settings.dailyEmailLimit) return 'Daily sending limit reached.';
  return null;
}
export function reserveEmail(store: MailStore, settings: MailBusinessSettings, now = Date.now(), jitterMs = crypto.randomInt(60000, 120001)) {
  validateBusiness(settings);
  return store.transaction(state => {
    const block = releaseBlock(state, settings, now); if (block) return { block, item: null };
    const item = state.items.find(item => item.status === 'queued' && item.notBefore <= now && !state.suppressed[item.email]);
    if (!item) return { block: 'No approved email is due.', item: null };
    item.status = 'sending'; item.attemptedAt = now;
    state.leaseUntil = now + 120000;
    state.nextReleaseAt = now + 12 * 60000 + Math.max(60000, Math.min(jitterMs, 120000));
    return { block: null, item: { ...item } };
  });
}
export function suppressEmail(store: MailStore, email: string, reason: string, now = Date.now()) {
  const normalized = normalizeEmail(email);
  store.transaction(state => {
    state.suppressed[normalized] = reason;
    for (const item of state.items.filter(item => item.email === normalized)) {
      if (item.status === 'queued' || item.status === 'paused') { item.status = 'cancelled'; item.error = reason; }
      if (reason === 'Bounced') item.bouncedAt = now; else if (reason === 'Replied' || reason === 'Not interested') item.replyAt = now;
    }
    const recent = state.items.filter(item => item.sentAt).sort((a, b) => b.sentAt! - a.sentAt!).slice(0, 30);
    if (reason === 'Spam complaint' || (recent.length && recent.filter(item => item.bouncedAt).length / recent.length > 0.03)) pauseMail(state, reason === 'Spam complaint' ? 'Spam complaint received. Queue paused.' : 'Bounce rate exceeds 3 percent of the last 30 sends (or all sends so far). Queue paused.', now);
  });
}
export function setQueuePaused(store: MailStore, paused: boolean) {
  store.transaction(state => {
    if (!paused && state.items.some(item => ['sending', 'unknown'].includes(item.status))) throw Error('Reconcile uncertain sends before resuming.');
    if (!paused && (!state.test?.verifiedAt || state.test.account !== state.account?.email)) throw Error('Verify your Gmail self-test first.');
    state.paused = paused; state.pauseReason = paused ? 'Paused by Marcus.' : undefined;
  });
}
