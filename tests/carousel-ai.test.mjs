import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseJsonReply, generate } from '../src/lib/server/carousel-ai.ts';
import { LYFE } from '../src/lib/carousel/brand.ts';
import { DEFAULT_BANNED } from '../src/lib/carousel/banned.ts';

const car = {
  id: 'car_0000000000', brandId: 'lyfe', mode: 'screenshot', template: 'screenshot', size: '3:4', theme: 'dark', useBrandColors: true, title: 'Money habits',
  inputs: { topic: 'money habits', steer: '', context: '', referenceUrl: '', referenceText: '', includeImages: false, goal: 'saves', structure: 'Listicle', slideCount: 5, badge: 'blue', output: 'carousel' },
  ideas: [], news: [], hooks: [], hook: 'Nobody tells you this about money', slides: [], caption: '', clone: { cover: null, inner: [], spec: null }, flags: [], status: 'draft', createdAt: '', updatedAt: '',
};
const deps = (replies, calls = []) => ({ send: async (p) => { calls.push(p); return replies.shift(); }, requireRuns: () => {}, brand: LYFE, banned: DEFAULT_BANNED, foundation: '' });

test('JSON inside a chatty fenced reply is read', () => {
  assert.deepEqual(parseJsonReply('Sure! ```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonReply('[1,2]'), [1, 2]);
});
test('a reply with no JSON gives a plain retry message', () => {
  assert.throws(() => parseJsonReply('no'), { message: "Claude's answer couldn't be read. Try again." });
});
test('hooks with a banned word get one rewrite', async () => {
  const calls = [];
  const out = await generate('hooks', car, {}, deps([
    JSON.stringify({ hooks: [{ text: 'Leverage your salary', formula: 'Stop doing X' }] }),
    JSON.stringify({ hooks: [{ text: 'Use your salary — properly', formula: 'Stop doing X' }] }),
  ], calls));
  assert.equal(calls.length, 2);
  assert.equal(out.hooks[0].text, 'Use your salary, properly');
  assert.deepEqual(out.flags, []);
});
test('slides come back with the requested count, a cover first and a CTA last', async () => {
  const slides = [1, 2, 3, 4, 5].map((n) => ({ headline: `H${n}`, body: `B${n}` }));
  const out = await generate('slides', car, {}, deps([JSON.stringify({ slides })]));
  assert.equal(out.slides.length, 5);
  assert.equal(out.slides[0].kind, 'cover'); assert.equal(out.slides[4].kind, 'cta');
});
test('turned-off agent runs stop generation before any model call', async () => {
  const calls = [];
  const d = { ...deps([], calls), requireRuns: () => { throw new Error('Agent runs are off.'); } };
  await assert.rejects(() => generate('ideas', car, {}, d), /Agent runs are off/);
  assert.equal(calls.length, 0);
});
test('broken JSON leaves a plain error and no partial result', async () => {
  await assert.rejects(() => generate('ideas', car, {}, deps(['I could not do that'])), /couldn't be read/);
});

test('the news step sends no brand notes or reference text and only allows web search', async () => {
  const calls = []; let seen;
  const d = { ...deps([JSON.stringify({ news: [] })], calls), foundation: 'SECRET-FOUNDATION', send: async (p, o) => { calls.push(p); seen = o; return JSON.stringify({ news: [] }); } };
  await generate('news', { ...car, inputs: { ...car.inputs, referenceText: 'SECRET-REF' } }, {}, d);
  assert.ok(!calls[0].includes('SECRET-FOUNDATION') && !calls[0].includes('SECRET-REF'));
  assert.deepEqual(seen.tools, ['WebSearch']);
});
