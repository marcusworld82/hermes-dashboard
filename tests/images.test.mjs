import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.HERMES_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-images-'));
process.env.HF_API_KEY_ID = 'kid'; process.env.HF_API_KEY_SECRET = 'ksecret';
const { generateWithCodex } = await import('../src/lib/server/images-codex.ts');
const hf = await import('../src/lib/server/higgsfield.ts');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

test('Codex image is found by the run id and saved to the media folder', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
  const run = async () => {
    const dir = path.join(home, 'generated_images', '01a0aaaa-0000-7000-8000-000000000001');
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'exec-1.png'), PNG);
    return '{"type":"thread.started","thread_id":"01a0aaaa-0000-7000-8000-000000000001"}\n{"type":"turn.completed"}\n';
  };
  const { file } = await generateWithCodex('a desk at sunrise', '3:4', { run, codexHome: home });
  assert.ok(fs.existsSync(path.join(process.env.HERMES_DATA_DIR, 'social-media', file)));
});
test('Codex without an image gives a plain error', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
  await assert.rejects(() => generateWithCodex('x', '3:4', { run: async () => '{"type":"thread.started","thread_id":"01a0bbbb-0000-7000-8000-000000000002"}', codexHome: home }), /didn't return an image/);
});

test('a Higgsfield quote reads credits and dollars from the estimate', async () => {
  let sent;
  const q = await hf.quote('flare', 'a desk', '3:4', async (url, init) => { sent = { url: String(url), init }; return json({ credits: '2.000', usd: '0.125' }); });
  assert.equal(q.credits, 2); assert.equal(q.usd, 0.125);
  assert.equal(sent.url, 'https://api.higgsfield.ai/estimate/marketing-studio/image/flare');
  assert.equal(sent.init.headers.Authorization, 'Key kid:ksecret');
  assert.equal(JSON.parse(sent.init.body).aspect_ratio, '3:4');
});
test('a text-only price description is kept as is and marked as not exact', async () => {
  const q = await hf.quote('soul2', 'x', '3:4', async () => json({ type: 'description', pricing_description: '1 credit per image' }));
  assert.equal(q.usd, null); assert.equal(q.description, '1 credit per image');
});
test('generation needs a fresh quote and uses it only once', async () => {
  await assert.rejects(() => hf.generateWithHiggsfield('nope'), /Get a fresh price/);
  const q = await hf.quote('flare', 'x', '3:4', async () => json({ credits: '1', usd: '0.06' }));
  let posts = 0;
  const fetcher = async (url, init) => {
    const u = String(url);
    if (init?.method === 'POST') { posts++; return json({ status: 'queued', request_id: 'd7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff', status_url: 'https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status' }); }
    if (u.endsWith('/status')) return json({ status: 'completed', request_id: 'd7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff', images: [{ url: 'https://cdn.higgsfield.ai/img.png' }] });
    return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
  };
  const out = await hf.generateWithHiggsfield(q.quoteId, { fetcher, sleep: async () => {} });
  assert.match(out.file, /\.png$/); assert.equal(posts, 1);
  await assert.rejects(() => hf.generateWithHiggsfield(q.quoteId, { fetcher, sleep: async () => {} }), /Get a fresh price/);
});
test('a failed submission is never retried', async () => {
  const q = await hf.quote('flare', 'x', '3:4', async () => json({ credits: '1', usd: '0.06' }));
  let posts = 0;
  await assert.rejects(() => hf.generateWithHiggsfield(q.quoteId, { fetcher: async () => { posts++; return json({ error: 'boom' }, 500); }, sleep: async () => {} }), /Check Higgsfield before trying again/);
  assert.equal(posts, 1);
});
