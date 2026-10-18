import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runChecks } from '../src/lib/carousel/checks.ts';
import { DEFAULT_BANNED } from '../src/lib/carousel/banned.ts';

const slide = (kind, headline, body = '') => ({ id: kind + headline, kind, layout: 'default', headline, body, images: [], textScale: 1, dim: 40, showHandle: true });
const base = {
  id: 'car_0000000000', brandId: 'lyfe', mode: 'creative', template: 'moola', size: '3:4', theme: 'dark', useBrandColors: false, title: '',
  inputs: { topic: '', steer: '', context: '', referenceUrl: '', referenceText: '', includeImages: false, goal: 'saves', structure: 'Listicle', slideCount: 3, badge: 'blue', output: 'carousel' },
  ideas: [], news: [], hooks: [], hook: '', slides: [slide('cover', 'Stop saving the *old* way'), slide('body', 'Pay yourself first'), slide('cta', 'Save this')],
  caption: 'Short.\n\nMore.\n\n#a #b #c', clone: { cover: null, inner: [], spec: null }, flags: [], status: 'draft', createdAt: '', updatedAt: '',
};
const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c.ok]));

test('a clean carousel passes every check', () => {
  assert.ok(runChecks(base, DEFAULT_BANNED, []).every((c) => c.ok));
});
test('banned words, em dashes, a missing CTA and a weak hook are caught', () => {
  const bad = { ...base, slides: [slide('cover', 'My money journey'), slide('body', 'We leverage it — fast')], caption: 'x #a' };
  const r = byId(runChecks(bad, DEFAULT_BANNED, []));
  assert.equal(r.banned, false); assert.equal(r.cta, false); assert.equal(r.hook, false); assert.equal(r.caption, false);
});
test('shrunk text from the renderer fails the safe-zone check', () => {
  assert.equal(byId(runChecks(base, DEFAULT_BANNED, ['Slide 2: body text is too long and shrank below a readable size.'])).safe, false);
});
