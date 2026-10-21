import crypto from 'node:crypto';
import type { MailStore } from './mail-queue-store.ts';
import { encryptGmailSecret, decryptGmailSecret, secretHash, equalHash } from './gmail-crypto.ts';
import { gmailConfig, GMAIL_SCOPES, exchangeGmailToken, gmailRequest } from './gmail-api.ts';
import { normalizeEmail } from './mail-queue.ts';

export function beginGmailOAuth(store: MailStore, now = Date.now()) {
  const config = gmailConfig();
  const state = crypto.randomBytes(32).toString('base64url'), browser = crypto.randomBytes(32).toString('base64url'), verifier = crypto.randomBytes(32).toString('base64url');
  const encrypted = encryptGmailSecret(verifier); // Fail before redirect if encryption is unavailable.
  store.transaction(value => { value.oauth = { hash: secretHash(state), browserHash: secretHash(browser), verifier: encrypted, expires: now + 600000 }; });
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: GMAIL_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, browser, secure: config.redirectUri.startsWith('https:') };
}
export function consumeOAuthState(store: MailStore, state: string, browser: string, now = Date.now()) {
  if (!state || !browser) throw Error('Gmail sign-in state is missing. Start Connect Gmail again.');
  return store.transaction(value => {
    const saved = value.oauth;
    if (!saved || saved.expires < now || !equalHash(saved.hash, secretHash(state)) || !equalHash(saved.browserHash, secretHash(browser))) throw Error('Gmail sign-in state expired or did not match this browser.');
    const verifier = decryptGmailSecret<string>(saved.verifier); delete value.oauth; return verifier;
  });
}
export async function finishGmailOAuth(store: MailStore, state: string, browser: string, code: string, fetcher: typeof fetch = fetch) {
  const verifier = consumeOAuthState(store, state, browser);
  if (!code) throw Error('Google did not return an authorization code.');
  const token = await exchangeGmailToken({ code, grant_type: 'authorization_code', redirect_uri: gmailConfig().redirectUri, code_verifier: verifier }, fetcher);
  if (!token.refresh_token || !GMAIL_SCOPES.every(scope => token.scope?.split(' ').includes(scope))) throw Error('Approve both Gmail send and read access, then reconnect.');
  const profile = await gmailRequest<{ emailAddress: string; historyId: string }>(token.access_token, 'profile', {}, fetcher);
  const email = normalizeEmail(profile.emailAddress);
  const encryptedTokens = encryptGmailSecret({ accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 });
  store.transaction(value => {
    value.account = { provider: 'google', email, historyId: profile.historyId, encryptedTokens, connectedAt: Date.now(), lastPollAt: 0 };
    delete value.test;
    value.paused = true; value.pauseReason = 'Gmail connected. Send and verify a test to your own inbox, then resume the queue.';
    // Old approvals do not authorize sending under a changed Gmail identity.
    for (const item of value.items) if (item.status === 'queued') { item.status = 'cancelled'; item.error = 'Gmail reconnected. Review and approve this draft again.'; }
  });
  return { email };
}
