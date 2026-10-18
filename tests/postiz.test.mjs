import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-postiz-'));
process.env.HERMES_DATA_DIR = dir;
const { postingPayload, validatePostMedia, PostizError } = await import('../src/lib/server/postiz.ts');
const { schedulePost, listPostRecords } = await import('../src/lib/server/social-posts.ts');

const ig = { id: 'chan1', name: 'Lyfe', identifier: 'instagram', disabled: false, profile: 'lyfe' };
const media = [{ id: 'm1', path: 'https://cdn.example/1.png' }, { id: 'm2', path: 'https://cdn.example/2.png' }, { id: 'm3', path: 'https://cdn.example/3.png' }];
const recordsFile = () => path.join(dir, 'social-posts.json');

test('Instagram carousel payload carries every slide on the first post', () => {
  const p = postingPayload(ig, '2026-10-20T15:00:00.000Z', 'Caption', media, false, false);
  assert.equal(p.posts[0].settings.post_type, 'post');
  assert.equal(p.posts[0].value[0].image.length, 3);
  assert.equal(p.type, 'schedule');
});
test('Instagram rejects a post with no media', () => {
  assert.throws(() => validatePostMedia('instagram', []), PostizError);
});

function fakeClient({ scheduleError } = {}) {
  const calls = { upload: 0, schedule: 0 };
  return {
    calls,
    async channels() { return [ig]; },
    async upload() {
      // The record must exist before anything is sent to Postiz.
      const saved = JSON.parse(fs.readFileSync(recordsFile(), 'utf8'));
      assert.ok(saved.some((r) => r.state === 'submitting'), 'record written before upload');
      calls.upload++; return { id: 'm' + calls.upload, path: `https://cdn.example/${calls.upload}.png` };
    },
    async schedule() { calls.schedule++; if (scheduleError) throw scheduleError; return 'post_' + calls.schedule; },
  };
}
const slidePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const input = (carouselId) => ({ carouselId, channelIds: ['chan1'], when: '2026-10-20T15:00:00.000Z', now: false, caption: 'Hi', slides: [slidePng, slidePng] });

test('a confirmed schedule stores the Postiz id', async () => {
  const client = fakeClient();
  const r = await schedulePost(input('car_ok'), client);
  assert.equal(r.state, 'scheduled'); assert.deepEqual(r.postizIds, ['post_1']); assert.equal(client.calls.upload, 2);
});
test('an unconfirmed schedule is marked uncertain and blocks a second submit', async () => {
  const client = fakeClient({ scheduleError: new PostizError('timeout', true) });
  const r = await schedulePost(input('car_unsure'), client);
  assert.equal(r.state, 'uncertain');
  await assert.rejects(() => schedulePost(input('car_unsure'), fakeClient()), /post in progress or unconfirmed/);
  assert.equal(listPostRecords().filter((x) => x.carouselId === 'car_unsure').length, 1);
});
test('a clear Postiz rejection is marked failed and can be retried', async () => {
  const r = await schedulePost(input('car_fail'), fakeClient({ scheduleError: new PostizError('Postiz request failed (400).') }));
  assert.equal(r.state, 'failed'); assert.match(r.error, /400/);
  const again = await schedulePost(input('car_fail'), fakeClient());
  assert.equal(again.state, 'scheduled');
});
