import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postingPayload, cleanPostOptions, assertOptionsFit, DEFAULT_POST_OPTIONS } from '../src/lib/server/postiz.ts';

const ch = (identifier) => ({ id: 'c1', name: 'n', identifier, disabled: false, profile: '' });
const media = [{ id: 'm1', path: 'https://x/y.mp4' }];

test('defaults keep the old payload', () => {
  const p = postingPayload(ch('instagram'), '2026-10-20T13:00:00Z', 'Hi', media, false, false);
  assert.equal(p.type, 'schedule');
  assert.deepEqual(p.posts[0].settings, { __type: 'instagram', post_type: 'post', is_trial_reel: false, collaborators: [] });
  assert.equal(p.posts[0].value.length, 1);
});

test('trial reel, collaborators and two comments on Instagram', () => {
  const o = cleanPostOptions({ comments: ['First', 'Second', ''], instagram: { postType: 'post', trialReel: true, graduation: 'SS_PERFORMANCE', collaborators: ['@partner'] } });
  assertOptionsFit(o, true);
  const p = postingPayload(ch('instagram'), 'd', 'Main', media, true, false, false, o);
  assert.equal(p.posts[0].settings.is_trial_reel, true);
  assert.equal(p.posts[0].settings.graduation_strategy, 'SS_PERFORMANCE');
  assert.deepEqual(p.posts[0].settings.collaborators, [{ label: 'partner' }]);
  assert.deepEqual(p.posts[0].value.map((v) => v.image.length), [1, 0, 0]);
  assert.match(p.posts[0].value[1].content, /First/);
});

test('trial reel refused for images or stories', () => {
  assert.throws(() => assertOptionsFit(cleanPostOptions({ instagram: { trialReel: true } }), false));
  assert.throws(() => assertOptionsFit(cleanPostOptions({ instagram: { trialReel: true, postType: 'story' } }), true));
});

test('TikTok and stories skip comments; draft type; X and TikTok settings', () => {
  const o = cleanPostOptions({ draft: true, comments: ['c'], tiktok: { privacy: 'SELF_ONLY', method: 'UPLOAD', title: 't' }, x: { whoCanReply: 'following' } });
  const t = postingPayload(ch('tiktok'), 'd', 'Main', media, true, false, false, o);
  assert.equal(t.type, 'draft');
  assert.equal(t.posts[0].value.length, 1);
  assert.equal(t.posts[0].settings.privacy_level, 'SELF_ONLY');
  assert.equal(t.posts[0].settings.content_posting_method, 'UPLOAD');
  const x = postingPayload(ch('x'), 'd', 'Main', [], false, false, false, o);
  assert.equal(x.posts[0].settings.who_can_reply_post, 'following');
  assert.equal(x.posts[0].value.length, 2);
  const story = postingPayload(ch('instagram'), 'd', 'Main', media, false, false, false, cleanPostOptions({ comments: ['c'], instagram: { postType: 'story' } }));
  assert.equal(story.posts[0].value.length, 1);
});

test('rejects bad input and unknown values fall back', () => {
  assert.throws(() => cleanPostOptions({ comments: ['a', 'b', 'c'] }));
  assert.throws(() => cleanPostOptions({ instagram: { collaborators: ['bad name!'] } }));
  assert.throws(() => cleanPostOptions({ x: { community: 'https://evil.com' } }));
  assert.deepEqual(cleanPostOptions({ instagram: { postType: 'reel' }, tiktok: { privacy: 'x' } }).instagram.postType, 'post');
  assert.deepEqual(cleanPostOptions(undefined), DEFAULT_POST_OPTIONS);
});
