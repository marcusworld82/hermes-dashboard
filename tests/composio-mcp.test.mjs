import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createComposioMcpSession } from '../src/lib/server/composio-mcp.ts';

process.env.GMAIL_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
const endpoint = 'https://connect.composio.dev/mcp';
function fixture({ brokenMetadata = false, tokenError = false, verify } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marcus-mcp-'));
  const file = path.join(directory, 'oauth.enc');
  let time = 1800000000000;
  let registrations = 0;
  let refreshes = 0;
  const fetchFn = async (input, init = {}) => {
    const url = input.toString();
    assert.equal(init.redirect, 'error');
    if (url.includes('oauth-protected-resource')) return Response.json({ resource: endpoint, authorization_servers: ['https://connect.composio.dev'] });
    if (url.includes('/.well-known/')) return Response.json({ issuer: 'https://connect.composio.dev', authorization_endpoint: 'https://connect.composio.dev/oauth/authorize', token_endpoint: brokenMetadata ? 'https://evil.example/token' : 'https://login.composio.dev/oauth2/token', registration_endpoint: 'https://login.composio.dev/oauth2/register', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] });
    if (url.endsWith('/register')) { registrations++; const body = JSON.parse(init.body); assert.equal(body.token_endpoint_auth_method, 'none'); return Response.json({ ...body, client_id: 'test-public-client' }, { status: 201 }); }
    if (url.endsWith('/token')) {
      const params = new URLSearchParams(init.body);
      if (tokenError) return new Response('upstream-private-secret', { status: 400 });
      if (params.get('grant_type') === 'refresh_token') { refreshes++; assert.equal(params.get('refresh_token'), 'private-refresh'); }
      else { assert.equal(params.get('code'), 'valid-code'); assert.ok(params.get('code_verifier').length >= 43); }
      return Response.json({ access_token: refreshes ? 'private-refreshed-token' : 'private-access', refresh_token: 'private-refresh', token_type: 'Bearer', expires_in: 60 });
    }
    if (url === endpoint) {
      const body = JSON.parse(init.body || '{}');
      const headers = new Headers(init.headers);
      assert.equal(headers.get('authorization'), refreshes ? 'Bearer private-refreshed-token' : 'Bearer private-access');
      if (body.id === undefined) return new Response(null, { status: 202 });
      let result;
      if (body.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'Composio', version: '1' } };
      else if (body.method === 'tools/list') result = { tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'].map(name => ({ name, inputSchema: { type: 'object' } })) };
      else if (body.method === 'tools/call') result = { content: [{ type: 'text', text: 'read result' }] };
      else if (init.method === 'DELETE') return new Response(null, { status: 200 });
      else throw Error('Unexpected MCP method: ' + body.method);
      return Response.json({ jsonrpc: '2.0', id: body.id, result });
    }
    throw Error('Unexpected URL: ' + url);
  };
  const session = createComposioMcpSession({ file, fetchFn, now: () => time, verify });
  return { session, anotherSession: () => createComposioMcpSession({ file, fetchFn, now: () => time, verify }), file, advance: ms => time += ms, counters: () => ({ registrations, refreshes }), cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
function state(login) { const url = new URL(login.url); assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3200/api/composio/mcp/callback'); return url.searchParams.get('state'); }

test('OAuth PKCE callback verifies MCP tools, encrypts credentials and refreshes without exposing secrets', async () => {
  const f = fixture();
  try {
    const login = await f.session.begin();
    assert.equal(f.session.status().connected, false);
    await f.session.finish('valid-code', state(login), login.browser);
    assert.equal(f.session.status().connected, true);
    assert.equal(f.session.status().toolsVerified, true);
    const disk = fs.readFileSync(f.file, 'utf8');
    for (const secret of ['private-access', 'private-refresh', 'test-public-client', login.browser]) assert.ok(!disk.includes(secret));
    assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(f.session.status()).includes('private-'));
    f.advance(60000);
    const result = await f.session.call('COMPOSIO_SEARCH_TOOLS', { queries: [] });
    assert.equal(result.content[0].text, 'read result');
    assert.equal(f.counters().refreshes, 1);
    await assert.rejects(f.session.finish('valid-code', state(login), login.browser), /sign-in did not complete/);
    await assert.rejects(f.session.call('GMAIL_SEND_EMAIL', {}), /Unsupported/);
  } finally { f.cleanup(); }
});

test('state, browser binding, expiry and one-use callback are enforced before token exchange', async () => {
  const f = fixture();
  try {
    const login = await f.session.begin();
    await assert.rejects(f.session.finish('valid-code', 'wrong-state', login.browser), /sign-in did not complete/);
    await assert.rejects(f.session.finish('valid-code', state(login), 'wrong-browser'), /sign-in did not complete/);
    f.advance(600001);
    await assert.rejects(f.session.finish('valid-code', state(login), login.browser), /sign-in did not complete/);
    assert.equal(f.session.status().connected, false);
  } finally { f.cleanup(); }
});

test('parallel module instances reuse one dynamic client registration', async () => {
  const f = fixture();
  try { const logins = await Promise.all([f.session.begin(), f.anotherSession().begin()]); assert.notEqual(state(logins[0]), state(logins[1])); assert.equal(f.counters().registrations, 1); }
  finally { f.cleanup(); }
});

test('OAuth metadata cannot move token exchange to another host', async () => {
  const f = fixture({ brokenMetadata: true });
  try { await assert.rejects(f.session.begin(), /sign-in did not complete/); assert.equal(f.counters().registrations, 0); }
  finally { f.cleanup(); }
});

test('upstream token errors are redacted and callback remains consumed', async () => {
  const f = fixture({ tokenError: true });
  try { const login = await f.session.begin(); await assert.rejects(f.session.finish('valid-code', state(login), login.browser), error => error.message === 'Composio sign-in did not complete. Connect again.'); await assert.rejects(f.session.finish('valid-code', state(login), login.browser), /sign-in did not complete/); assert.equal(f.session.status().connected, false); }
  finally { f.cleanup(); }
});

 test('failed verification during reconnect clears previously verified status', async () => {
  let verified = false;
  const f = fixture({ verify: async () => { if (verified) throw Error('private verification failure'); verified = true; return ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS']; } });
  try {
    const first = await f.session.begin();
    await f.session.finish('valid-code', state(first), first.browser);
    assert.equal(f.session.status().connected, true);
    const second = await f.session.begin();
    await assert.rejects(f.session.finish('valid-code', state(second), second.browser), /sign-in did not complete/);
    assert.equal(f.session.status().connected, false);
    assert.equal(f.session.status().toolsVerified, false);
  } finally { f.cleanup(); }
});
