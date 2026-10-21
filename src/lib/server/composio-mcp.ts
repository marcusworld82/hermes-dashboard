import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { encryptGmailSecret, decryptGmailSecret, secretHash, equalHash } from './gmail-crypto.ts';
import { paths } from './paths.ts';

export const COMPOSIO_MCP_ENDPOINT = 'https://connect.composio.dev/mcp';
const ISSUER = 'https://connect.composio.dev';
const AUTHORIZE = ISSUER + '/oauth/authorize';
const TOKEN = 'https://login.composio.dev/oauth2/token';
const REGISTER = 'https://login.composio.dev/oauth2/register';
const SCOPE = 'openid profile email offline_access';
const LOGIN_ERROR = 'Composio sign-in did not complete. Connect again.';
const META_TOOLS = new Set(['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_GET_TOOL_SCHEMAS', 'COMPOSIO_MANAGE_CONNECTIONS', 'COMPOSIO_MULTI_EXECUTE_TOOL', 'COMPOSIO_REMOTE_WORKBENCH', 'COMPOSIO_REMOTE_BASH_TOOL']);
type Pending = { state: string; browserHash: string; expiresAt: number; callback: string; verifier?: string };
type Saved = { client?: OAuthClientInformationMixed; tokens?: OAuthTokens; tokenExpiresAt?: number; pending: Record<string, Pending>; toolsVerified?: boolean; lastCheckedAt?: number };
const sharedRuntime = globalThis as typeof globalThis & { __marcusComposioMcpLocks?: Map<string, Promise<unknown>> };
const operationLocks = sharedRuntime.__marcusComposioMcpLocks ||= new Map<string, Promise<unknown>>();
type Options = { file?: string; fetchFn?: typeof fetch; now?: () => number; verify?: (provider: OAuthClientProvider, fetcher: typeof fetch) => Promise<string[]> };

export function composioMcpCallbackUrl() {
  const url = new URL(process.env.COMPOSIO_MCP_CALLBACK_URL || 'http://localhost:3200/api/composio/mcp/callback');
  if (url.pathname !== '/api/composio/mcp/callback' || url.search || url.hash || url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw Error('Invalid Composio callback configuration.');
  return url;
}

export function createComposioMcpSession(options: Options = {}) {
  const file = options.file || path.join(paths.data, 'composio-mcp.enc');
  const now = options.now || Date.now;
  const rawFetch = options.fetchFn || fetch;
  const locked = <T>(operation: () => Promise<T>) => {
    const key = path.resolve(file);
    const previous = operationLocks.get(key) || Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(() => {}, () => {});
    operationLocks.set(key, tail);
    void tail.then(() => { if (operationLocks.get(key) === tail) operationLocks.delete(key); });
    return result;
  };
  function read(): Saved { return fs.existsSync(/* turbopackIgnore: true */ file) ? decryptGmailSecret<Saved>(fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8')) : { pending: {} }; }
  function save(value: Saved) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(temporary, encryptGmailSecret(value), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  const safeFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.protocol !== 'https:' || url.username || url.password || !['connect.composio.dev', 'login.composio.dev'].includes(url.hostname) || url.port) throw Error(LOGIN_ERROR);
    const isMetadata = url.pathname.startsWith('/.well-known/');
    if (!(isMetadata && url.origin === ISSUER) && ![COMPOSIO_MCP_ENDPOINT, TOKEN, REGISTER].includes(url.href)) throw Error(LOGIN_ERROR);
    const response = await rawFetch(input, { ...init, redirect: 'error', signal: init?.signal || AbortSignal.timeout(20000) });
    if (response.status >= 300 && response.status < 400) throw Error(LOGIN_ERROR);
    if (isMetadata && response.ok) {
      const metadata = await response.clone().json();
      if (metadata.resource && metadata.resource !== COMPOSIO_MCP_ENDPOINT) throw Error(LOGIN_ERROR);
      if (metadata.authorization_servers && (!Array.isArray(metadata.authorization_servers) || metadata.authorization_servers.some((issuer: string) => issuer !== ISSUER))) throw Error(LOGIN_ERROR);
      if (metadata.issuer !== undefined && (metadata.issuer !== ISSUER || metadata.authorization_endpoint !== AUTHORIZE || metadata.token_endpoint !== TOKEN || metadata.registration_endpoint !== REGISTER || !metadata.code_challenge_methods_supported?.includes('S256'))) throw Error(LOGIN_ERROR);
    }
    return response;
  };
  function provider(saved: Saved, pending?: Pending, interactive = false) {
    let authorizationUrl = '';
    const value: OAuthClientProvider = {
      redirectUrl: pending?.callback || composioMcpCallbackUrl().href,
      clientMetadata: { client_name: 'Marcus OS', redirect_uris: [pending?.callback || composioMcpCallbackUrl().href], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPE },
      state: () => pending?.state || crypto.randomBytes(32).toString('base64url'),
      clientInformation: () => saved.client,
      saveClientInformation: client => { saved.client = client; save(saved); },
      tokens: () => interactive ? undefined : saved.tokens,
      saveTokens: tokens => { saved.tokens = tokens; saved.tokenExpiresAt = typeof tokens.expires_in === 'number' ? now() + tokens.expires_in * 1000 : undefined; save(saved); },
      redirectToAuthorization: url => { if (!interactive || url.origin + url.pathname !== AUTHORIZE) throw Error(LOGIN_ERROR); authorizationUrl = url.href; },
      saveCodeVerifier: verifier => { if (!pending) throw Error(LOGIN_ERROR); pending.verifier = verifier; save(saved); },
      codeVerifier: () => { if (!pending?.verifier) throw Error(LOGIN_ERROR); return pending.verifier; },
      saveDiscoveryState: (discovery: OAuthDiscoveryState) => { if (discovery.authorizationServerUrl !== ISSUER || !discovery.authorizationServerMetadata || discovery.authorizationServerMetadata.issuer !== ISSUER) throw Error(LOGIN_ERROR); },
      invalidateCredentials: scope => { if (scope === 'all' || scope === 'client') delete saved.client; if (scope === 'all' || scope === 'tokens') { delete saved.tokens; saved.toolsVerified = false; } if ((scope === 'all' || scope === 'verifier') && pending) delete pending.verifier; save(saved); },
    };
    return { value, url: () => authorizationUrl };
  }
  async function withClient<T>(value: OAuthClientProvider, operation: (client: Client) => Promise<T>) {
    const client = new Client({ name: 'marcus-os', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(COMPOSIO_MCP_ENDPOINT), { authProvider: value, fetch: safeFetch });
    try { await client.connect(transport); return await operation(client); }
    finally { await client.close().catch(() => {}); await transport.close().catch(() => {}); }
  }
  return {
    status() {
      try { const saved = read(); const connected = !!saved.tokens?.access_token && !!saved.toolsVerified; return { connected, needsLogin: !connected, endpoint: COMPOSIO_MCP_ENDPOINT, toolsVerified: !!saved.toolsVerified, ...(saved.lastCheckedAt ? { lastCheckedAt: saved.lastCheckedAt } : {}) }; }
      catch { return { connected: false, needsLogin: true, endpoint: COMPOSIO_MCP_ENDPOINT, toolsVerified: false, error: 'Composio credentials could not be loaded. Reconnect Composio.' }; }
    },
    begin: () => locked(async () => {
      try {
        const saved = read();
        for (const [key, pending] of Object.entries(saved.pending)) if (pending.expiresAt <= now()) delete saved.pending[key];
        if (Object.keys(saved.pending).length >= 10) throw Error(LOGIN_ERROR);
        const browser = crypto.randomBytes(32).toString('base64url');
        const pending: Pending = { state: crypto.randomBytes(32).toString('base64url'), browserHash: secretHash(browser), expiresAt: now() + 600000, callback: composioMcpCallbackUrl().href };
        saved.pending[secretHash(pending.state)] = pending;
        // Check server encryption configuration before registering a public OAuth client.
        save(saved);
        const oauth = provider(saved, pending, true);
        if (await auth(oauth.value, { serverUrl: COMPOSIO_MCP_ENDPOINT, scope: SCOPE, fetchFn: safeFetch }) !== 'REDIRECT' || !oauth.url()) throw Error(LOGIN_ERROR);
        return { url: oauth.url(), browser, secure: new URL(pending.callback).protocol === 'https:' };
      } catch { throw Error(LOGIN_ERROR); }
    }),
    finish: (code: string, state: string, browser: string) => locked(async () => {
      try {
        const saved = read(); const key = secretHash(state); const pending = saved.pending[key];
        if (!pending || !code || !browser || pending.expiresAt <= now() || !equalHash(pending.browserHash, secretHash(browser))) throw Error(LOGIN_ERROR);
        delete saved.pending[key]; saved.toolsVerified = false; save(saved);
        const oauth = provider(saved, pending);
        if (await auth(oauth.value, { serverUrl: COMPOSIO_MCP_ENDPOINT, authorizationCode: code, scope: SCOPE, fetchFn: safeFetch }) !== 'AUTHORIZED') throw Error(LOGIN_ERROR);
        const tools = options.verify ? await options.verify(oauth.value, safeFetch) : await withClient(oauth.value, async client => (await client.listTools()).tools.map(tool => tool.name));
        if (!tools.includes('COMPOSIO_SEARCH_TOOLS') || !tools.includes('COMPOSIO_MANAGE_CONNECTIONS')) throw Error(LOGIN_ERROR);
        saved.toolsVerified = true; saved.lastCheckedAt = now(); save(saved);
        return { connected: true };
      } catch { throw Error(LOGIN_ERROR); }
    }),
    call: (name: string, args: Record<string, unknown>) => locked(async () => {
      if (!META_TOOLS.has(name)) throw Error('Unsupported Composio tool.');
      try {
        const saved = read(); if (!saved.tokens || !saved.toolsVerified) throw Error(LOGIN_ERROR);
        const oauth = provider(saved);
        if (saved.tokenExpiresAt && saved.tokenExpiresAt <= now() + 30000) {
          if (!saved.tokens.refresh_token || await auth(oauth.value, { serverUrl: COMPOSIO_MCP_ENDPOINT, fetchFn: safeFetch, scope: SCOPE }) !== 'AUTHORIZED') throw Error(LOGIN_ERROR);
        }
        return await withClient(oauth.value, client => client.callTool({ name, arguments: args }));
      } catch { throw Error('Composio request failed. Reconnect Composio if sign-in has expired.'); }
    }),
  };
}
const session = createComposioMcpSession();
export const getComposioMcpStatus = session.status;
export const beginComposioMcpLogin = session.begin;
export const finishComposioMcpLogin = session.finish;
export const callComposioMcpTool = session.call;
