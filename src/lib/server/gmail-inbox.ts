import type { MailStore } from './mail-queue-store.ts';
import { accessToken, gmailRequest, gmailHeader, gmailText, GmailHttpError, type GmailMessage } from './gmail-api.ts';
import { suppressEmail, pauseMail } from './mail-queue.ts';

export function classifyInbound(message: GmailMessage, self: string, tracked: { email: string; threadId?: string; messageId: string }[]) {
  const sender = gmailHeader(message, 'From').match(/<([^>]+)>/)?.[1] || gmailHeader(message, 'From').trim();
  if (message.labelIds?.includes('SENT') || sender.toLowerCase() === self.toLowerCase()) return [];
  const from = gmailHeader(message, 'From').toLowerCase();
  const content = gmailText(message.payload);
  const references = `${gmailHeader(message, 'In-Reply-To')} ${gmailHeader(message, 'References')}`;
  const bounce = /mailer-daemon|postmaster/.test(from) || /multipart\/report/i.test(message.payload?.mimeType || '') && /final-recipient:|action:\s*failed/i.test(content);
  const complaint = /feedback-type:\s*abuse/i.test(content) && /multipart\/report/i.test(message.payload?.mimeType || '');
  return tracked.filter(item => {
    const escaped = item.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (bounce || complaint) return content.includes(item.messageId) || new RegExp(`(?:final-recipient:[^\\n]*|original-rcpt-to:[^\\n]*|failed-recipient:[^\\n]*)${escaped}(?:[\\s>]|$)`, 'i').test(content);
    return (message.threadId && message.threadId === item.threadId) || references.includes(item.messageId) || new RegExp(`(?:^|[<\\s])${escaped}(?:>|\\s|$)`, 'i').test(from);
  }).map(item => ({ email: item.email, reason: complaint ? 'Spam complaint' : bounce ? 'Bounced' : /\bnot interested\b|\bunsubscribe\b|\bno thanks\b|\bremove me\b|\bstop emailing\b/i.test(content) ? 'Not interested' : 'Replied' }));
}
export async function pollGmailInbox(store: MailStore, fetcher: typeof fetch = fetch) {
  const before = store.read(), account = before.account;
  if (!account) throw Error('Connect Gmail first.');
  const token = await accessToken(store, fetcher);
  try {
    const messageIds = new Set<string>(); let pageToken = '', historyId = account.historyId;
    try {
      for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams({ startHistoryId: account.historyId, historyTypes: 'messageAdded', maxResults: '100' });
        if (pageToken) params.set('pageToken', pageToken);
        const result = await gmailRequest<{ historyId: string; nextPageToken?: string; history?: { messagesAdded?: { message: { id: string } }[] }[] }>(token, `history?${params}`, {}, fetcher);
        for (const event of result.history || []) for (const added of event.messagesAdded || []) messageIds.add(added.message.id);
        historyId = result.historyId; pageToken = result.nextPageToken || '';
        if (!pageToken) break;
        if (page === 9) throw Error('Inbox history is too large for one safe check. Queue remains blocked.');
      }
    } catch (error) {
      if (!(error instanceof GmailHttpError) || error.status !== 404) throw error;
      // An expired Gmail cursor needs a bounded full sync before release is allowed.
      const baseline = await gmailRequest<{ historyId: string }>(token, 'profile', {}, fetcher);
      historyId = baseline.historyId; pageToken = '';
      for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams({ q: `after:${Math.floor((account.lastPollAt || account.connectedAt) / 1000) - 86400} -in:sent`, maxResults: '100', includeSpamTrash: 'true' });
        if (pageToken) params.set('pageToken', pageToken);
        const result = await gmailRequest<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `messages?${params}`, {}, fetcher);
        for (const message of result.messages || []) messageIds.add(message.id);
        pageToken = result.nextPageToken || '';
        if (!pageToken) break;
        if (page === 9) throw Error('Inbox recovery needs more than 1,000 messages. Queue remains blocked.');
      }
    }
    let changes = 0;
    for (const id of messageIds) {
      if (before.seenMessages.includes(id)) continue;
      const message = await gmailRequest<GmailMessage>(token, `messages/${encodeURIComponent(id)}?format=full`, {}, fetcher);
      if (/multipart\/report/i.test(message.payload?.mimeType || '') && /feedback-type:\s*abuse/i.test(gmailText(message.payload))) store.transaction(value => pauseMail(value, 'Spam complaint received. Queue paused.'));
      const tracked = store.read().items.filter(item => item.sentAt || item.attemptedAt);
      for (const result of classifyInbound(message, account.email, tracked)) { suppressEmail(store, result.email, result.reason); changes++; }
      store.transaction(value => { value.seenMessages.push(id); value.seenMessages = value.seenMessages.slice(-10000); });
    }
    store.transaction(value => {
      if (!value.account || value.account.connectedAt !== account.connectedAt) throw Error('Gmail account changed during inbox check.');
      value.account.historyId = historyId; value.account.lastPollAt = Date.now(); delete value.account.pollError;
    });
    return { checked: messageIds.size, changes };
  } catch (error) {
    store.transaction(value => { if (value.account) value.account.pollError = error instanceof GmailHttpError ? error.message : 'Inbox check failed. Sending is blocked until a complete check succeeds.'; });
    throw error;
  }
}
export function recordSpamComplaint(store: MailStore, email: string) { suppressEmail(store, email, 'Spam complaint'); store.transaction(state => pauseMail(state, 'Spam complaint received. Queue paused.')); }
