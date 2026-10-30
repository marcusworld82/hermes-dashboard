import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCutlineBlobBackend } from '../cloud/src/lib/server/cutline-cloud-store.mjs';
import { createCutlineProjects } from '../cloud/src/lib/server/cutline-cloud-projects.mjs';
import { probeMP4, UPLOAD_BYTES } from '../cloud/src/lib/server/cutline-cloud-media.mjs';
import { createCutlineProjectHTTP } from '../cloud/src/lib/server/cutline-cloud-project-http.mjs';
import { makeSession } from '../cloud/src/lib/server/security.mjs';
function box(type, content) { const b = Buffer.alloc(8); b.writeUInt32BE(content.length + 8); b.write(type, 4); return Buffer.concat([b, content]); }
function fixtureMP4({ duration = 2, w = 1080, h = 1920 } = {}) {
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(duration * 1000, 16);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(w * 65536, 76); tkhd.writeUInt32BE(h * 65536, 80);
  const hdlr = Buffer.alloc(24); hdlr.write('vide', 8);
  return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\0\0isommp42')), box('moov', Buffer.concat([box('mvhd', mvhd), box('trak', Buffer.concat([box('tkhd', tkhd), box('mdia', box('hdlr', hdlr))]))])), box('mdat', Buffer.from('offline-structural-fixture-not-a-decoder-test'))]);
}
function storage() {
  const objects = new Map(); let version = 0; const calls = [];
  const blob = {
    async get(path, options) { calls.push(['get', path, options]); const saved = objects.get(path); return saved ? { statusCode: 200, blob: { pathname: path, size: saved.content.length, etag: saved.etag }, stream: new Response(saved.content).body } : null; },
    async put(path, body, options) { calls.push(['put', path, options]); assert.equal(options.access, 'private'); const prior = objects.get(path); if (prior && (!options.allowOverwrite || prior.etag !== options.ifMatch)) { const e = Error('conflict'); e.name = 'BlobPreconditionFailedError'; throw e; } objects.set(path, { content: Buffer.from(body), etag: String(++version) }); },
    async del(path) { objects.delete(path); },
  };
  const backend = createCutlineBlobBackend({ blob, approvedBudget: undefined }); let id = 0;
  return { blob, backend, objects, calls, projects: createCutlineProjects({ blob, repository: backend.repository, makeId: () => 'fixture' + ++id, now: () => 123456 }) };
}
test('actual MP4 metadata parser ignores client claims and rejects signature/type/truncation/duration/dimensions', () => {
  assert.deepEqual(probeMP4(fixtureMP4(), 'video/mp4'), { duration: 2, w: 1080, h: 1920 });
  for (const [data, mime] of [[Buffer.from('<html>arbitrary input</html>'), 'video/mp4'], [fixtureMP4(), 'text/html'], [fixtureMP4().subarray(0, 25), 'video/mp4'], [fixtureMP4({ duration: 121 }), 'video/mp4'], [fixtureMP4({ w: 1922 }), 'video/mp4'], [Buffer.alloc(UPLOAD_BYTES + 1), 'video/mp4']]) assert.throws(() => probeMP4(data, mime), e => e.code === 'INVALID_MEDIA');
});
test('private ingestion, listing, immutable autosave, CAS conflict, source ranges, SRT, style/layout ownership', async () => {
  const f = storage(); const bytes = fixtureMP4(); const project = await f.projects.create('owner', bytes, 'video/mp4', 'My <clip>.mp4');
  assert.equal(project.revision, 1); assert.equal(project.title, 'My clip.mp4'); assert.equal((await f.projects.list('owner')).length, 1); assert.equal((await f.projects.list('other')).length, 0);
  const doc = structuredClone(project.doc); doc.words = [{ id: 'w0', text: 'Hello', start: 0, end: 1 }]; doc.captions = [{ id: 'c0', wordIds: ['w0'], words: {}, x: 0.5, y: 0.3, scale: 1 }]; doc.video.w = 99999;
  const saved = await f.projects.save('owner', project.id, 1, doc); assert.equal(saved.revision, 2); assert.equal(saved.doc.video.w, 1080);
  const old = await f.backend.projects.authorize('owner', project.id, 1); assert.equal((await f.projects.docAt(old)).words.length, 0);
  await assert.rejects(f.projects.save('owner', project.id, 1, doc), e => e.code === 'REVISION_CONFLICT');
  await assert.rejects(f.projects.load('other', project.id), e => e.status === 404);
  const range = await f.projects.source('owner', project.id, 'bytes=4-7'); assert.equal(range.status, 206); assert.equal(await range.text(), 'ftyp'); assert.equal(range.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await f.projects.source('owner', project.id, 'bytes=999999-')).status, 416);
  assert.match(await f.projects.srt('owner', project.id), /Hello/);
  await f.projects.saveLibrary('owner', 'styles', { name: 'Saved Look', style: { color: '#fff' }, preset: 'Gold Punch' });
  await f.projects.saveLibrary('owner', 'layouts', { name: 'Saved Layout', style: {}, settings: {}, pos: { x: 0.5, y: 0.3 } });
  assert.equal((await f.projects.library('owner', 'styles')).length, 1); assert.equal((await f.projects.library('other', 'styles')).length, 0);
  await assert.rejects(f.projects.saveLibrary('owner', 'styles', { name: '__proto__', style: {} }));
  await assert.rejects(f.projects.saveLibrary('owner', 'styles', { name: 'Unsafe', style: { font: 'url(http://localhost)' } }));
  assert.ok([...f.objects.keys()].every(k => k.startsWith('cutline/private/')));
});
test('simultaneous autosaves preserve exactly one new immutable revision and report conflict', async () => {
  const f = storage(); const p = await f.projects.create('owner', fixtureMP4(), 'video/mp4', 'clip');
  const results = await Promise.allSettled([f.projects.save('owner', p.id, 1, p.doc), f.projects.save('owner', p.id, 1, p.doc)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'REVISION_CONFLICT').length, 1);
  assert.equal((await f.projects.load('owner', p.id)).revision, 2);
});
test('storage HTTP fails closed before storage calls and rejects unauthenticated or cross-origin uploads', async () => {
  const f = storage(); let loads = 0; const env = { HERMES_SESSION_SECRET: 'offline-project-secret' };
  const req = (authenticated, origin = 'https://hermes.test') => new Request('https://hermes.test/api/cutline-cloud/projects?name=clip', { method: 'POST', headers: { host: 'hermes.test', origin, 'content-type': 'video/mp4', ...(authenticated ? { cookie: `hermes_session=${makeSession(env.HERMES_SESSION_SECRET)}` } : {}) }, body: fixtureMP4() });
  const handler = createCutlineProjectHTTP({ env, async loadProjects() { loads++; return f.projects; }, editorHTML: async () => 'fixture' });
  assert.equal((await handler(req(false), 'create')).status, 401); assert.equal((await handler(req(true, 'https://attacker.test'), 'create')).status, 403); assert.equal((await handler(req(true), 'create')).status, 503); assert.equal(loads, 0);
  const enabled = createCutlineProjectHTTP({ env: { ...env, CUTLINE_CLOUD_STORAGE_ENABLED: 'true', CUTLINE_CLOUD_UPLOADS_ENABLED: 'true', BLOB_STORE_ID: 'offline', VERCEL_OIDC_TOKEN: 'offline' }, loadProjects: async () => f.projects, editorHTML: async () => 'fixture' });
  const response = await enabled(req(true), 'create'); assert.equal(response.status, 201); assert.ok((await response.json()).doc.id); assert.equal(f.calls.some(c => c[0] === 'put'), true);
});
test('served original editor injects cloud bridge before vendor capture and rewrites actual media URL only', async () => {
  const { cutlineCloudEditorHTML } = await import('../cloud/src/lib/server/cutline-cloud-editor.mjs'); const html = await cutlineCloudEditorHTML();
  assert.ok(html.indexOf('function cutlineCloudEditorBridge') < html.indexOf('const cutlineFetch = window.fetch.bind(window)'));
  assert.ok(html.includes('vid.src = "/api/cutline-cloud/projects/"')); assert.ok(html.includes('const E = CaptionEngine')); assert.ok(html.includes('REVISION') === false); assert.ok(html.includes('NOT SAVED')); assert.ok(html.includes('window.__cutlineCloudDoc = () => doc'));
  const vm = await import('node:vm'); for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (script[1].trim()) new vm.Script(script[1]);
  assert.ok(!/src="https?:/.test(html)); assert.ok(html.includes('Per-job maximum: $')); assert.ok(html.includes('Daily maximum: $'));
});

test('direct upload allocates owned private paths, mints one restricted token, validates before attaching and supports idempotent finalize', async () => {
  const { createCutlineDirectHTTP } = await import('../cloud/src/lib/server/cutline-cloud-direct.mjs'); const f = storage(); let id = 0; let tokenOptions; let callbacks;
  const env = { HERMES_SESSION_SECRET: 'offline-direct', CUTLINE_CLOUD_STORAGE_ENABLED: 'true', CUTLINE_CLOUD_UPLOADS_ENABLED: 'true', CUTLINE_CLOUD_DIRECT_UPLOADS_ENABLED: 'true', BLOB_READ_WRITE_TOKEN: 'offline-token' };
  const bytes = fixtureMP4();
  f.blob.head = async path => ({ pathname: path, size: f.objects.get(path).content.length, contentType: 'video/mp4' });
  const handler = createCutlineDirectHTTP({ env, makeId: () => 'direct' + ++id, loadResources: async () => ({ blob: f.blob, uploads: f.backend.uploads, projects: f.projects }), handleUpload: async options => { callbacks = options.onUploadCompleted; tokenOptions = await options.onBeforeGenerateToken(options.body.payload.pathname, options.body.payload.clientPayload); return { type: 'blob.generate-client-token', clientToken: 'offline-signed-fixture' }; } });
  const req = body => new Request('https://hermes.test/api/cutline-cloud/uploads/prepare', { method: 'POST', headers: { host: 'hermes.test', origin: 'https://hermes.test', cookie: `hermes_session=${makeSession(env.HERMES_SESSION_SECRET)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const allocated = await handler(req({ name: 'direct.mp4', size: bytes.length, contentType: 'video/mp4' }), 'prepare'); assert.equal(allocated.status, 201); const allocation = await allocated.json();
  assert.match(allocation.pathname, /^cutline\/private\/owner\/projects\/direct1\/source.mp4$/);
  const tokenBody = { type: 'blob.generate-client-token', payload: { pathname: allocation.pathname, clientPayload: allocation.uploadId, multipart: true } };
  assert.equal((await handler(req({ ...tokenBody, payload: { ...tokenBody.payload, pathname: 'cutline/private/other/source.mp4' } }), 'token')).status, 409);
  assert.equal((await handler(req(tokenBody), 'token')).status, 200); assert.equal(tokenOptions.allowOverwrite, false); assert.deepEqual(tokenOptions.allowedContentTypes, ['video/mp4']); assert.equal(tokenOptions.maximumSizeInBytes, bytes.length); assert.equal(callbacks, undefined);
  assert.equal((await handler(req(tokenBody), 'token')).status, 409);
  assert.equal((await handler(req({ type: 'blob.upload-completed', payload: {} }), 'token')).status, 400);
  // Mock client sends bytes directly to private storage, not through a server request.
  f.objects.set(allocation.pathname, { content: bytes, etag: 'uploaded' });
  const finalized = await handler(req({ uploadId: allocation.uploadId }), 'finalize'); assert.equal(finalized.status, 201); const project = await finalized.json(); assert.equal(project.doc.video.w, 1080);
  assert.equal((await handler(req({ uploadId: allocation.uploadId }), 'finalize')).status, 200); assert.equal((await f.projects.list('owner')).length, 1);
  assert.equal((await handler(req({ uploadId: allocation.uploadId, url: 'http://localhost/' }), 'finalize')).status, 400);
});
test('invalid direct-upload bytes are quarantined, retained private, and never enter project listing', async () => {
  const { createCutlineDirectHTTP } = await import('../cloud/src/lib/server/cutline-cloud-direct.mjs'); const f = storage(); const env = { HERMES_SESSION_SECRET: 'offline-direct', CUTLINE_CLOUD_STORAGE_ENABLED: 'true', CUTLINE_CLOUD_UPLOADS_ENABLED: 'true', CUTLINE_CLOUD_DIRECT_UPLOADS_ENABLED: 'true', BLOB_READ_WRITE_TOKEN: 'offline' };
  const invalid = Buffer.alloc(100, 60); const path = 'cutline/private/owner/projects/bad/source.mp4';
  await f.backend.uploads.create({ id: 'bad-upload', owner: 'owner', projectId: 'bad', path, state: 'pending', size: 100, name: 'bad.mp4', expiresAt: Date.now() + 100000 }); await f.backend.uploads.issue('owner', 'bad-upload', path);
  f.objects.set(path, { content: invalid, etag: 'uploaded' }); f.blob.head = async () => ({ pathname: path, size: 100, contentType: 'video/mp4' });
  const handler = createCutlineDirectHTTP({ env, loadResources: async () => ({ blob: f.blob, uploads: f.backend.uploads, projects: f.projects }), handleUpload: async () => { throw Error('must not issue token'); } });
  const request = new Request('https://hermes.test/api/cutline-cloud/uploads/finalize', { method: 'POST', headers: { host: 'hermes.test', origin: 'https://hermes.test', cookie: `hermes_session=${makeSession(env.HERMES_SESSION_SECRET)}`, 'content-type': 'application/json' }, body: JSON.stringify({ uploadId: 'bad-upload' }) });
  const result = await handler(request, 'finalize'); assert.equal(result.status, 415); assert.equal((await f.backend.uploads.get('owner', 'bad-upload')).state, 'quarantined'); assert.equal((await f.projects.list('owner')).length, 0); assert.equal(f.objects.has(path), true);
});

test('cloud editor warns before debounce and keeps dirty until every queued edit is saved',async()=>{
  const vm=await import('node:vm');const {cutlineCloudEditorBridge}=await import('../cloud/src/lib/server/cutline-cloud-editor.mjs');
  const handlers={},elements=new Map(),writes=[];const window={fetch:async(path,options={})=>{if(options.method==='PUT')return new Promise(resolve=>writes.push({resolve,body:JSON.parse(options.body)}));return Response.json({revision:1,doc:{id:'fixture'}});},addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const document={getElementById:id=>elements.get(id),createElement:()=>({style:{},setAttribute(){}}),body:{appendChild:el=>elements.set(el.id,el)}};
  vm.runInNewContext('('+cutlineCloudEditorBridge.toString()+')()',{window,document,location:{origin:'https://fixture.invalid'},URL,Response,Map,Promise,structuredClone,setTimeout,clearTimeout,console});
  await window.fetch('/api/project/fixture');
  const dirty=()=>{let prevented=false;handlers.beforeunload({preventDefault(){prevented=true;}});return prevented;};assert.equal(dirty(),false);
  window.__cutlineCloudMarkDirty();assert.equal(dirty(),true,'warn immediately, before the original400ms timer fires');
  const first=window.fetch('/api/project/fixture',{method:'POST',body:JSON.stringify({id:'fixture',style:'first'})});await new Promise(r=>setTimeout(r,0));assert.equal(writes.length,1);
  window.__cutlineCloudMarkDirty();const second=window.fetch('/api/project/fixture',{method:'POST',body:JSON.stringify({id:'fixture',style:'second'})});
  writes[0].resolve(Response.json({revision:2}));await first;await new Promise(r=>setTimeout(r,0));assert.equal(writes.length,2);assert.equal(writes[1].body.baseRevision,2);assert.equal(dirty(),true,'earlier save must not clear a newer unsaved edit');
  writes[1].resolve(Response.json({revision:3}));await second;assert.equal(dirty(),false);
});
