import crypto from 'node:crypto';
import type { MailStore } from './mail-queue-store.ts';
import { equalHash, secretHash } from './gmail-crypto.ts';
import { GmailHttpError } from './gmail-api.ts';
import { normalizeEmail } from './mail-queue.ts';
import { getComposioSettings } from './composio-settings.ts';

const API = 'https://backend.composio.dev/api/v3';
export function preferredGmailProvider(): 'google' | 'composio' { return process.env.GMAIL_PROVIDER === 'google' ? 'google' : 'composio'; }
export function composioGmailConfig() {
  const config = getComposioSettings();
  if (!config.apiKey || !config.authConfigId) throw Error('Add the Composio API key and Gmail auth config in Settings first.');
  const callback = new URL(config.callbackUrl);
  if (callback.pathname !== '/api/gmail/composio/callback' || callback.search || callback.hash || callback.username || callback.password || (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(callback.hostname)))) throw Error('Use an HTTPS Composio Gmail callback URL, or localhost for this Mac.');
  return config;
}
async function composioRequest<T>(endpoint: string, init: RequestInit, fetcher: typeof fetch): Promise<T> {
  const config = composioGmailConfig();
  const response = await fetcher(`${API}/${endpoint}`, { ...init, headers: { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) throw new GmailHttpError(response.status);
  return response.json();
}
export async function composioGmailRequest<T>(connectedAccountId: string, endpoint: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<T> {
  if (!connectedAccountId || !/^(profile|history|messages)(?:[/?]|$)/.test(endpoint) || endpoint.includes('..') || endpoint.includes('#')) throw Error('Invalid Gmail proxy request.');
  const method = init.method || 'GET';
  if (method !== 'GET' && !(method === 'POST' && endpoint === 'messages/send')) throw Error('Unsupported Gmail proxy operation.');
  const { userId } = composioGmailConfig();
  const result = await composioRequest<{ status: number; data: T }>('tools/execute/proxy', { method: 'POST', body: JSON.stringify({ connected_account_id: connectedAccountId, user_id: userId, endpoint: `https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, method, ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) }) }, fetcher);
  // Preserve the upstream status so an expired history cursor triggers bounded recovery.
  if (!Number.isInteger(result.status) || result.status < 200 || result.status >= 300) throw new GmailHttpError(result.status || 502);
  if (result.data === undefined || result.data === null) throw Error('Composio returned an incomplete Gmail response.');
  return result.data;
}
export async function beginComposioGmail(store: MailStore, fetcher: typeof fetch = fetch, now = Date.now()) {
  const config = composioGmailConfig();
  const state = crypto.randomBytes(32).toString('base64url'), browser = crypto.randomBytes(32).toString('base64url');
  const callback = new URL(config.callbackUrl); callback.searchParams.set('state', state);
  const flow = await composioRequest<{ redirect_url: string; connected_account_id: string }>('connected_accounts/link', { method: 'POST', body: JSON.stringify({ auth_config_id: config.authConfigId, user_id: config.userId, callback_url: callback.href }) }, fetcher);
  const redirect = new URL(flow.redirect_url);
  if (redirect.protocol !== 'https:' || !['connect.composio.dev', 'backend.composio.dev'].includes(redirect.hostname) || redirect.port || redirect.username || redirect.password || typeof flow.connected_account_id !== 'string' || !flow.connected_account_id) throw Error('Composio returned an incomplete sign-in link.');
  store.transaction(value => { value.composioOAuth = { hash: secretHash(state), browserHash: secretHash(browser), connectedAccountId: flow.connected_account_id, userId: config.userId, authConfigId: config.authConfigId, expires: now + 600000 }; });
  return { url: redirect.href, browser, secure: config.callbackUrl.startsWith('https:') };
}
export async function finishComposioGmail(store: MailStore, state: string, browser: string, fetcher: typeof fetch = fetch, now = Date.now()) {
  const config = composioGmailConfig();
  const pending = store.transaction(value => {
    const saved = value.composioOAuth;
    if (!state || !browser || !saved || saved.expires < now || !equalHash(saved.hash, secretHash(state)) || !equalHash(saved.browserHash, secretHash(browser))) throw Error('Gmail sign-in state expired or did not match this browser.');
    delete value.composioOAuth; return saved;
  });
  if (pending.userId !== config.userId || pending.authConfigId !== config.authConfigId) throw Error('Composio account settings changed. Connect again.');
  const account = await composioRequest<{ id: string; status: string; user_id: string; toolkit?: { slug?: string }; auth_config?: { id?: string; is_disabled?: boolean }; is_disabled?: boolean }>(`connected_accounts/${encodeURIComponent(pending.connectedAccountId)}`, {}, fetcher);
  if (account.id !== pending.connectedAccountId || account.user_id !== pending.userId || account.auth_config?.id !== pending.authConfigId || account.toolkit?.slug !== 'gmail' || account.status !== 'ACTIVE' || account.is_disabled || account.auth_config.is_disabled) throw Error('Composio Gmail account is inactive or does not match this sign-in.');
  const profile = await composioGmailRequest<{ emailAddress: string; historyId: string }>(pending.connectedAccountId, 'profile', {}, fetcher);
  const email = normalizeEmail(profile.emailAddress);
  if (!/^\d+$/.test(profile.historyId)) throw Error('Gmail returned an incomplete account profile.');
  store.transaction(value => {
    if (value.composioOAuth) throw Error('A newer Gmail sign-in started. Complete that account connection instead.');
    value.account = { provider: 'composio', connectedAccountId: pending.connectedAccountId, email, historyId: profile.historyId, connectedAt: Date.now(), lastPollAt: 0 };
    delete value.test; value.paused = true;
    value.pauseReason = 'Gmail connected. Send and verify a test to your own inbox, then resume the queue.';
    for (const item of value.items) if (item.status === 'queued') { item.status = 'cancelled'; item.error = 'Gmail reconnected. Review and approve this draft again.'; }
  });
  return { email };
}
