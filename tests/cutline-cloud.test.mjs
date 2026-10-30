import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderWorker, parseRenderRequest, validateBundle, readBoundedJson } from '../cloud/src/lib/server/cutline-cloud-core.mjs';
import { cutlineCloudStatus } from '../cloud/src/lib/server/cutline-cloud-status.mjs';
import { createSnapshotProvider } from '../cloud/src/lib/server/cutline-cloud-provider.mjs';
const bundle = () => ['index.html', 'engine.js', 'assets/source.mp4'].map(rel => ({ rel, content: Buffer.from('trusted test fixture') }));
const input = { projectId: 'clip1', revision: 1, requestId: 'request1' };
function fixture(options = {}) {
  const jobs = new Map(); const calls = { restores: 0, stops: 0, uploads: 0, settlements: [] };
  const store = {
    async get(owner, id) { const j = jobs.get(id); return j?.owner === owner ? j : null; },
    async create(job) { const prior = [...jobs.values()].find(j => j.owner === job.owner && j.requestId === job.requestId); if (prior) return prior; jobs.set(job.id, job); return job; },
    async claim(owner, id) { const job = await this.get(owner, id); if (!job || job.state !== 'queued') return null; job.state = 'running'; return job; },
    async finish(owner, id, change) { Object.assign(await this.get(owner, id), change); },
  };
  const deps = { store,
    budget: { async reserve() { return options.blockBudget ? null : 'approved-reservation'; }, async settle(value) { calls.settlements.push(value); } },
    projects: { async authorize(owner) { if (owner !== 'owner') throw Error('not owned'); }, async bundle() { return bundle(); } },
    provider: { async restore() { calls.restores++; return { async render() { if (options.hang) return new Promise(() => {}); if (options.fail) throw Error('internal provider detail'); return Buffer.from('mp4'); }, async stop() { calls.stops++; if (options.stopFail) throw Error('stop failed'); } }; } },
    outputs: { async putPrivate() { calls.uploads++; return 'private_output_1'; } }, timeoutMs: 15,
  };
  return { worker: createRenderWorker(deps), calls, jobs, store };
}
test('deployment remains blocked and never claims cloud parity', () => { const s = cutlineCloudStatus(); assert.equal(s.available, false); assert.equal(s.canUpload, false); assert.equal(s.features.faceDetection, 'mac-only-apple-vision'); });
test('rejects URL/JS inputs, traversal, duplicate bundle names and excessive dimensions of request surface', () => {
  for (const value of [{ ...input, html: '<script/>' }, { ...input, projectId: '../x' }, { ...input, revision: Infinity }, { ...input, redoOf: 'https://x' }]) assert.throws(() => parseRenderRequest(value));
  for (const rel of ['../index.html', '/index.html', 'assets/%2e%2e/x.mp4', 'assets\\x.mp4', 'https://example.com/a.mp4']) assert.throws(() => validateBundle([...bundle(), { rel, content: Buffer.from('x') }]));
  assert.throws(() => validateBundle([...bundle(), bundle()[0]]));
});
test('streamed body size is bounded without trusting content-length', async () => {
  await assert.rejects(readBoundedJson(new Request('https://hermes.test/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(4097) })), e => e.status === 413);
});
test('job is async, owned, idempotent, private, claimed once and stopped', async () => {
  const f = fixture(); const job = await f.worker.enqueue('owner', input); assert.equal(job.state, 'queued'); assert.equal(f.calls.restores, 0);
  assert.equal((await f.worker.enqueue('owner', input)).id, job.id); assert.equal(await f.store.get('other', job.id), null);
  await f.worker.run('other', job.id); assert.equal(f.calls.restores, 0);
  await Promise.all([f.worker.run('owner', job.id), f.worker.run('owner', job.id)]);
  assert.equal(job.state, 'succeeded'); assert.equal(job.outputId, 'private_output_1'); assert.equal(f.calls.restores, 1); assert.equal(f.calls.stops, 1); assert.equal(f.calls.uploads, 1);
});
test('budget denial happens before provisioning', async () => {
  const f = fixture({ blockBudget: true }); const j = await f.worker.enqueue('owner', input); await f.worker.run('owner', j.id);
  assert.equal(j.state, 'failed'); assert.equal(j.errorCode, 'BUDGET_BLOCKED'); assert.equal(f.calls.restores, 0);
});
test('timeout stops sandbox, no upload or automatic retry, explicit Redo is a new job', async () => {
  const f = fixture({ hang: true }); const j = await f.worker.enqueue('owner', input); await f.worker.run('owner', j.id); await f.worker.run('owner', j.id);
  assert.equal(j.state, 'timed_out'); assert.equal(f.calls.stops, 1); assert.equal(f.calls.uploads, 0); assert.equal(f.calls.restores, 1);
  const redo = await f.worker.enqueue('owner', { ...input, requestId: 'request2', redoOf: j.id }); assert.notEqual(redo.id, j.id); assert.equal(redo.state, 'queued');
});
test('failed jobs redact provider errors and keep reservation if cleanup fails', async () => {
  const f = fixture({ fail: true, stopFail: true }); const j = await f.worker.enqueue('owner', input); await f.worker.run('owner', j.id);
  assert.equal(j.errorCode, 'RENDER_FAILED'); assert.equal(j.state, 'failed'); assert.equal(f.calls.settlements[0].cleanupFailed, true); assert.equal(JSON.stringify(j).includes('internal provider detail'), false);
});
test('snapshot adapter cannot fall back to installing tools or fresh provisioning', () => {
  assert.throws(() => createSnapshotProvider({ sdk: {}, snapshotId: '', approvedEngineDigest: '' }), e => e.code === 'SNAPSHOT_REQUIRED');
});

test('real SDK binding uses snapshot-only deny-all create and official command/file methods', async () => {
  const { createVercelSandboxSDK } = await import('../cloud/src/lib/server/cutline-cloud-vercel.mjs');
  const { createHash } = await import('node:crypto'); const calls = [];
  const engine = bundle()[1].content;
  const sandbox = { async writeFiles(files) { calls.push(['files', files]); }, async runCommand(command) { calls.push(['command', command]); return { exitCode: 0 }; }, async readFileToBuffer() { return Buffer.from('mp4'); }, async stop() { calls.push(['stop']); } };
  const sdk = createVercelSandboxSDK({ Sandbox: { async create(options) { calls.push(['create', options]); return sandbox; } } });
  const provider = createSnapshotProvider({ sdk, snapshotId: 'snp_offline', approvedEngineDigest: createHash('sha256').update(engine).digest('hex') });
  const session = await provider.restore({ signal: new AbortController().signal, timeoutMs: 5000 });
  assert.equal((await session.render(bundle(), new AbortController().signal)).toString(), 'mp4'); await session.stop();
  assert.equal(calls[0][1].networkPolicy, 'deny-all'); assert.deepEqual(calls[0][1].source, { type: 'snapshot', snapshotId: 'snp_offline' });
  assert.equal(calls.filter(c => c[0] === 'create').length, 1); assert.equal(calls.filter(c => c[0] === 'command').length, 2);
  const wrong = createSnapshotProvider({ sdk, snapshotId: 'snp_offline', approvedEngineDigest: 'a'.repeat(64) });
  const mismatch = await wrong.restore({ signal: new AbortController().signal, timeoutMs: 5000 });
  await assert.rejects(mismatch.render(bundle(), new AbortController().signal), e => e.code === 'ENGINE_MISMATCH'); await mismatch.stop();
});
test('real Blob binding only writes private objects and downloads owner-prefixed objects without leaking URLs', async () => {
  const { createPrivateBlobOutputs } = await import('../cloud/src/lib/server/cutline-cloud-vercel.mjs'); const calls = [];
  const outputs = createPrivateBlobOutputs({ blob: {
    async put(path, content, options) { calls.push({ path, options }); return { url: 'https://private.invalid/do-not-expose' }; },
    async get(path, options) { calls.push({ path, options }); return { statusCode: 200, stream: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('mp4')); c.close(); } }), blob: { pathname: path, size: 3 } }; },
  } });
  const outputId = await outputs.putPrivate({ owner: 'owner', jobId: 'job1', content: Buffer.from('mp4'), signal: new AbortController().signal });
  assert.equal(outputId, 'job1'); assert.equal(calls[0].options.access, 'private'); assert.equal(calls[0].options.allowOverwrite, false);
  const response = await outputs.download('owner', outputId); assert.equal(await response.text(), 'mp4'); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(calls[1].path, 'cutline/private/owner/job1.mp4'); await assert.rejects(outputs.download('../other', outputId));
});

test('compiler preserves shared engine and escapes script termination while rejecting unsafe fonts/URLs', async () => {
  const { readFile } = await import('node:fs/promises'); const { createHash } = await import('node:crypto');
  const { createCutlineCompiler } = await import('../cloud/src/lib/server/cutline-cloud-compiler.mjs');
  const engine = await readFile(new URL('../cloud/public/cutline-assets/engine.js', import.meta.url));
  const compiler = createCutlineCompiler({ engine, engineDigest: createHash('sha256').update(engine).digest('hex'), gsap: Buffer.from('/* trusted fixture */'), fonts: [{ family: 'Avenir Next', file: 'avenir.woff2', content: Buffer.from('licensed fixture') }] });
  const doc = { video: { duration: 2, w: 1080, h: 1920 }, settings: { transitionSound: false }, words: [{ id: 'w1', text: '</script><script>unsafe</script>', start: 0, end: 1 }], captions: [{ id: 'c1', wordIds: ['w1'], words: {} }], style: {} };
  const files = compiler.compile(doc, Buffer.from('owned fixture')); const html = files.find(f => f.rel === 'index.html').content.toString();
  assert.equal(html.includes('</script><script>unsafe'), false); assert.ok(html.includes('\\u003c/script>')); assert.ok(html.includes('CaptionEngine.renderVideo')); assert.ok(files.find(f => f.rel === 'engine.js').content.equals(engine));
  assert.throws(() => compiler.compile({ ...doc, style: { font: 'Unlicensed Font' } }, Buffer.from('video')));
  assert.throws(() => compiler.compile({ ...doc, source: 'http://127.0.0.1/secrets' }, Buffer.from('video')));
});
test('Blob CAS persists queue claims and enforces daily spend before any provider operation', async () => {
  const { createCutlineBlobBackend } = await import('../cloud/src/lib/server/cutline-cloud-store.mjs'); let data; let version = 0;
  const blob = {
    async get() { return data ? { statusCode: 200, blob: { size: data.length, etag: String(version) }, stream: new Response(data).body } : null; },
    async put(path, value, options) {
      if ((data && options.ifMatch !== String(version)) || (data && !options.allowOverwrite)) { const e = Error('conflict'); e.name = 'BlobPreconditionFailedError'; throw e; }
      assert.equal(options.access, 'private'); data = value; version++;
    },
  };
  const backend = createCutlineBlobBackend({ blob, approvedBudget: { perJobCents: 100, dailyCents: 100, concurrency: 1 } });
  await backend.store.create({ id: 'job1', owner: 'owner', requestId: 'one', state: 'queued' }); await backend.store.claim('owner', 'job1', 0, 1);
  assert.equal(await backend.budget.reserve({ owner: 'owner', jobId: 'job1' }), 'job1');
  await backend.budget.settle({ reservation: 'job1', cleanupFailed: false });
  await backend.store.create({ id: 'job2', owner: 'owner', requestId: 'two', state: 'queued' }); await backend.store.claim('owner', 'job2', 0, 1);
  assert.equal(await backend.budget.reserve({ owner: 'owner', jobId: 'job2' }), null);
  await backend.store.interruptExpired(); assert.equal((await backend.store.get('owner', 'job2')).state, 'interrupted'); assert.equal(await backend.store.claim('owner', 'job2', 2, 1), null);
});

test('snapshot preparation cannot provision without explicit approval and pinned tools', async () => {
  const { prepareApprovedCutlineSnapshot } = await import('../cloud/src/lib/server/cutline-cloud-snapshot.mjs'); let creates = 0;
  const Sandbox = { async create() { creates++; } };
  await assert.rejects(prepareApprovedCutlineSnapshot({ Sandbox }), e => e.code === 'SETUP_NOT_AUTHORIZED');
  await assert.rejects(prepareApprovedCutlineSnapshot({ Sandbox, approval: { authorized: true, reservationId: 'approved', maxSetupMs: 1000 }, versions: { hyperframes: 'latest' } }), e => e.code === 'PIN_REQUIRED');
  assert.equal(creates, 0);
});

test('HTTP authenticates status, blocks cross-origin mutation and never loads disabled runtime', async () => {
  const { createCutlineHTTP } = await import('../cloud/src/lib/server/cutline-cloud-http.mjs');
  const { makeSession } = await import('../cloud/src/lib/server/security.mjs'); let loads = 0;
  const env = { HERMES_SESSION_SECRET: 'offline-secret' }; const cookie = `hermes_session=${makeSession(env.HERMES_SESSION_SECRET)}`;
  const handle = createCutlineHTTP({ env, async loadRuntime() { loads++; throw Error('must not run'); } });
  const req = (method, origin = 'https://hermes.test', authenticated = true) => new Request('https://hermes.test/api/cutline-cloud/jobs', { method, headers: { host: 'hermes.test', origin, ...(authenticated ? { cookie } : {}), 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(input) } : {}) });
  assert.equal((await handle(req('GET', undefined, false), 'status')).status, 401);
  assert.equal((await handle(req('POST', 'https://attacker.test'), 'enqueue')).status, 403);
  const blocked = await handle(req('POST'), 'enqueue'); assert.equal(blocked.status, 503); assert.equal(loads, 0);
  const status = await (await handle(req('GET'), 'status')).json(); assert.equal(status.canRender, false); assert.ok(status.blockerDetails.some(b => b.code === 'BUDGET_REQUIRED')); assert.equal(JSON.stringify(status).includes('offline-secret'), false);
});
test('HTTP enqueue never dispatches, explicit dispatch claims once and owned private download survives spending pause', async () => {
  const { createCutlineHTTP } = await import('../cloud/src/lib/server/cutline-cloud-http.mjs');
  const { makeSession } = await import('../cloud/src/lib/server/security.mjs');
  const f = fixture(); const env = { HERMES_SESSION_SECRET: 'offline-secret' }; let paused = false; let downloads = 0;
  const handle = createCutlineHTTP({ env, status: () => ({ available: !paused, blockerDetails: paused ? [{ code: 'SPENDING_DISABLED' }] : [] }), async loadRuntime() { return { worker: f.worker, store: f.store, outputs: { async download(owner) { assert.equal(owner, 'owner'); downloads++; return new Response('private mp4'); } } }; } });
  const req = method => new Request('https://hermes.test/api/cutline-cloud/jobs', { method, headers: { host: 'hermes.test', origin: 'https://hermes.test', cookie: `hermes_session=${makeSession(env.HERMES_SESSION_SECRET)}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(input) } : {}) });
  const enqueue = await handle(req('POST'), 'enqueue'); assert.equal(enqueue.status, 202); const id = (await enqueue.json()).job.id; assert.equal(f.calls.restores, 0);
  await handle(req('GET'), 'job', id); assert.equal(f.calls.restores, 0);
  await handle(req('POST'), 'dispatch', id); await handle(req('POST'), 'dispatch', id); assert.equal(f.calls.restores, 1);
  paused = true; assert.equal((await handle(req('POST'), 'dispatch', id)).status, 503);
  assert.equal(await (await handle(req('GET'), 'output', id)).text(), 'private mp4'); assert.equal(downloads, 1);
  assert.equal((await handle(req('GET'), 'output', 'nonexistent')).status, 404);
});
