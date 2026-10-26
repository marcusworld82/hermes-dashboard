import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-studio-test-'));
process.env.HERMES_DATA_DIR = dir;
delete process.env.METRICOOL_WEBHOOK_URL;
const { STUDIO_SKILLS, listDrafts, editDraft, approveDraft, publishDraft } = await import('../src/lib/server/social-studio.ts');
const file = path.join(dir, 'social-studio', 'drafts.json');
fs.mkdirSync(path.dirname(file));
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });
function seed(skillId = 'ig-carousel') {
  const date = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify([{ id: 'qa', skillId, platform: 'instagram', brief: 'QA only', researchFirst: false, output: 'Test text', status: 'ready', createdAt: date, updatedAt: date }]));
}

test('approval and connection gates prevent outbound calls', async () => {
  assert.equal(STUDIO_SKILLS.length, 13);
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('No network allowed'); };
  seed();
  await assert.rejects(publishDraft('qa'), /Approve/);
  assert.throws(() => editDraft('qa', ' '), /empty/);
  assert.equal(listDrafts()[0].status, 'ready');
  approveDraft('qa');
  await assert.rejects(publishDraft('qa'), /not connected/);
  editDraft('qa', 'Changed text');
  assert.equal(listDrafts()[0].status, 'ready');
  seed('competitors');
  approveDraft('qa');
  await assert.rejects(publishDraft('qa'), /not published/);
  assert.equal(calls, 0);
});

test('mocked webhook sends once and unknown outcomes cannot be retried', async () => {
  process.env.METRICOOL_WEBHOOK_URL = 'https://example.invalid/test-only';
  seed();
  const when = new Date(Date.now() + 3600000).toISOString();
  approveDraft('qa', when);
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(listDrafts()[0].status, 'uncertain');
    assert.deepEqual(JSON.parse(init.body), { draftId: 'qa', platform: 'instagram', kind: 'ig-carousel', text: 'Test text', scheduledFor: when });
    return new Response('{}', { status: 200 });
  };
  assert.equal((await publishDraft('qa')).status, 'sent');
  await assert.rejects(publishDraft('qa'), /Approve/);
  assert.equal(calls, 1);
  seed(); approveDraft('qa');
  globalThis.fetch = async () => { throw Error('Timeout'); };
  assert.equal((await publishDraft('qa')).status, 'uncertain');
  await assert.rejects(publishDraft('qa'), /Approve/);
  seed(); approveDraft('qa');
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  assert.notEqual((await publishDraft('qa')).status, 'sent');
  delete process.env.METRICOOL_WEBHOOK_URL;
});
