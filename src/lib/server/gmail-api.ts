import type { MailStore } from './mail-queue-store.ts';
import { decryptGmailSecret, encryptGmailSecret } from './gmail-crypto.ts';
import { normalizeEmail } from './mail-queue.ts';
import { composioGmailRequest } from './composio-gmail.ts';

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];
export type GmailTokens = { accessToken: string; refreshToken: string; expiresAt: number };
export type GmailCredential = string | { provider: 'composio'; connectedAccountId: string };
export type GmailMessage = { id: string; threadId?: string; labelIds?: string[]; internalDate?: string; payload?: GmailPart };
export type GmailPart = { mimeType?: string; headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: GmailPart[] };
export class GmailHttpError extends Error { status: number; constructor(status: number) { super(`Gmail request failed (HTTP ${status}). Reconnect if access has expired.`); this.status = status; } }
export function gmailConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID || '', clientSecret = process.env.GMAIL_CLIENT_SECRET || '', redirectUri = process.env.GMAIL_REDIRECT_URI || '';
  if (!clientId || !clientSecret || !redirectUri) throw Error('Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REDIRECT_URI on the server.');
  const uri = new URL(redirectUri);
  if (uri.pathname !== '/api/gmail/callback' || uri.search || uri.hash || uri.username || uri.password || (uri.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(uri.hostname))) throw Error('Use an HTTPS Gmail callback URL, or localhost for this Mac.');
  return { clientId, clientSecret, redirectUri };
}
export async function exchangeGmailToken(params: Record<string, string>, fetcher: typeof fetch = fetch) {
  const config = gmailConfig();
  const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`Google sign-in failed (HTTP ${response.status}). Reconnect Gmail.`);
  const result = await response.json();
  if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in)) throw Error('Google returned incomplete credentials. Reconnect Gmail.');
  return result as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}
export async function accessToken(store: MailStore, fetcher: typeof fetch = fetch) {
  const account = store.read().account;
  if (!account) throw Error('Connect Gmail first.');
  if (account.provider === 'composio') {
    if (!account.connectedAccountId) throw Error('Reconnect Gmail. The Composio account is missing.');
    return { provider: 'composio' as const, connectedAccountId: account.connectedAccountId };
  }
  if (!account.encryptedTokens) throw Error('Reconnect Gmail. Google credentials are missing.');
  const tokens = decryptGmailSecret<GmailTokens>(account.encryptedTokens);
  if (tokens.expiresAt > Date.now() + 60000) return tokens.accessToken;
  const refreshed = await exchangeGmailToken({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }, fetcher);
  const updated = encryptGmailSecret({ accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || tokens.refreshToken, expiresAt: Date.now() + refreshed.expires_in * 1000 });
  store.transaction(state => {
    if (state.account?.email !== account.email || state.account.connectedAt !== account.connectedAt) throw Error('Gmail connection changed during refresh. Try again.');
    state.account.encryptedTokens = updated;
  });
  return refreshed.access_token;
}
export async function gmailRequest<T>(token: GmailCredential, endpoint: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<T> {
  if (typeof token !== 'string') return composioGmailRequest<T>(token.connectedAccountId, endpoint, init, fetcher);
  const response = await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new GmailHttpError(response.status);
  return response.json();
}
export function gmailHeader(message: GmailMessage, name: string) { return message.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''; }
export function gmailText(part?: GmailPart): string { return part ? [part.body?.data ? Buffer.from(part.body.data, 'base64url').toString('utf8') : '', ...(part.parts || []).map(gmailText)].join('\n') : ''; }
export function rawEmail(input: { from: string; to: string; subject: string; body: string; messageId: string; replyToId?: string }) {
  const from = normalizeEmail(input.from), to = normalizeEmail(input.to);
  if (/[\r\n]/.test(input.subject) || /[\r\n]/.test(input.messageId) || /[\r\n]/.test(input.replyToId || '')) throw Error('Invalid email header.');
  const headers = [`From: ${from}`, `To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(input.subject).toString('base64')}?=`, `Message-ID: ${input.messageId}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'];
  if (input.replyToId) headers.push(`In-Reply-To: ${input.replyToId}`, `References: ${input.replyToId}`);
  return Buffer.from([...headers, '', Buffer.from(input.body).toString('base64').match(/.{1,76}/g)!.join('\r\n')].join('\r\n')).toString('base64url');
}
