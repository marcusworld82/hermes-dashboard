import crypto from 'node:crypto';
import type { MailStore } from './mail-queue-store.ts';
import { accessToken, gmailRequest, rawEmail, gmailHeader, type GmailMessage } from './gmail-api.ts';
import { pollGmailInbox } from './gmail-inbox.ts';
import { exactEmailDraft, eligibleLead, pauseMail, reserveEmail, sendingWindow, type LeadEmailResolver, type MailBusinessSettings } from './mail-queue.ts';

export async function sendGmailSelfTest(store: MailStore, fetcher: typeof fetch = fetch) {
  const account = store.read().account;
  if (!account) throw Error('Connect Gmail first.');
  const token = await accessToken(store, fetcher);
  const messageId = `<${crypto.randomUUID()}@marcus-os.local>`;
  store.transaction(state => {
    if (state.leaseUntil > Date.now() || state.items.some(item => ['sending', 'unknown'].includes(item.status))) throw Error('A send is active or needs review.');
    if (state.test && Date.now() - state.test.requestedAt < 60000) throw Error('Wait one minute before another self-test.');
    state.leaseUntil = Date.now() + 120000;
    state.test = { account: account.email, requestedAt: Date.now(), messageId };
    state.paused = true; state.pauseReason = 'Verify this self-test before releasing lead emails.';
  });
  try {
    const result = await gmailRequest<{ id: string }>(token, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: rawEmail({ from: account.email, to: account.email, subject: 'Marcus OS Gmail connection test', body: 'This is your requested Marcus OS connection test. No lead has been emailed.', messageId }) }) }, fetcher);
    if (!result.id) throw Error('Gmail did not confirm the test.');
    store.transaction(state => { if (state.test?.messageId === messageId) state.test.gmailId = result.id; state.leaseUntil = 0; });
    return { sentTo: account.email, needsVerification: true };
  } catch {
    store.transaction(state => { if (state.test?.messageId === messageId) state.test.error = 'Test result is uncertain. Check your inbox before retrying.'; state.leaseUntil = 0; });
    throw Error('Test result is uncertain. Check your own inbox before retrying.');
  }
}
export async function verifyGmailSelfTest(store: MailStore, fetcher: typeof fetch = fetch) {
  const state = store.read(), test = state.test;
  if (!state.account || !test?.gmailId || test.account !== state.account.email) throw Error('Send a test to the connected Gmail account first.');
  const token = await accessToken(store, fetcher);
  const message = await gmailRequest<GmailMessage>(token, `messages/${encodeURIComponent(test.gmailId)}?format=full`, {}, fetcher);
  if (!message.labelIds?.includes('INBOX') || gmailHeader(message, 'To').trim().toLowerCase() !== state.account.email || gmailHeader(message, 'Message-ID') !== test.messageId) throw Error('The test has not been verified in your inbox. Wait briefly and check again.');
  store.transaction(value => { if (value.test?.messageId !== test.messageId || value.account?.email !== test.account) throw Error('Test changed. Check again.'); value.test.verifiedAt = Date.now(); });
  return { verified: true, email: test.account };
}
export async function releaseGmailQueue(store: MailStore, settings: MailBusinessSettings, resolveLead: LeadEmailResolver, fetcher: typeof fetch = fetch, dispatchGuard: () => string | null = () => null) {
  const initialBlock = dispatchGuard(); if (initialBlock) return { sent: false, reason: initialBlock };
  // A failed or incomplete reply scan always prevents the next send.
  await pollGmailInbox(store, fetcher);
  const claim = reserveEmail(store, settings);
  if (!claim.item) return { sent: false, reason: claim.block };
  const item = claim.item;
  let requestStarted = false;
  try {
    const lead = await resolveLead(item.leadId, item.kind);
    eligibleLead(lead, item.kind);
    if (exactEmailDraft(lead, settings).draftHash !== item.draftHash) throw Error('The lead or exact draft changed. Review and approve it again.');
    const token = await accessToken(store, fetcher);
    const account = store.read().account;
    if (!account) throw Error('Gmail disconnected.');
    const parent = store.read().items.find(row => row.id === item.parentId);
    const dispatchBlock = dispatchGuard(); if (dispatchBlock) throw Error(dispatchBlock);
    // Final local suppression check immediately before the provider call.
    store.transaction(state => {
      const current = state.items.find(row => row.id === item.id);
      if (state.paused || current?.status !== 'sending' || state.suppressed[item.email] || !sendingWindow(Date.now(), settings.weekendSending).allowed || state.account?.email !== account.email) throw Error('Queue, contact or sending window changed. No email sent.');
    });
    requestStarted = true;
    const result = await gmailRequest<{ id: string; threadId: string }>(token, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: rawEmail({ from: account.email, to: item.email, subject: item.subject, body: item.body, messageId: item.messageId, replyToId: parent?.messageId }), ...(parent?.threadId ? { threadId: parent.threadId } : {}) }) }, fetcher);
    if (!result.id) throw Error('Gmail returned no message receipt.');
    store.transaction(state => {
      const current = state.items.find(row => row.id === item.id)!;
      current.status = 'sent'; current.sentAt = Date.now();
      state.nextReleaseAt = Math.max(state.nextReleaseAt, current.sentAt + 12 * 60000 + crypto.randomInt(60000, 120001));
      current.gmailId = result.id; current.threadId = result.threadId;
      state.leaseUntil = 0;
    });
    return { sent: true, id: item.id };
  } catch {
    store.transaction(state => {
      const current = state.items.find(row => row.id === item.id)!;
      current.status = requestStarted ? 'unknown' : 'cancelled';
      current.error = requestStarted ? 'Gmail send result is uncertain. Check Sent mail. Never retry automatically.' : 'Lead, draft, account or sending window changed. Review before approving again.';
      state.leaseUntil = 0;
      if (requestStarted) pauseMail(state, current.error);
    });
    return { sent: false, reason: requestStarted ? 'Uncertain send. Queue paused for review.' : 'Current lead or draft failed the final check.' };
  }
}
