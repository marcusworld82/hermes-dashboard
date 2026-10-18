import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvas, safeBox, fitText } from '../src/lib/carousel/layout.ts';
import { findBanned, stripDashes, DEFAULT_BANNED } from '../src/lib/carousel/banned.ts';

test('3:4 canvas keeps text inside the Instagram safe zone', () => {
  assert.deepEqual(canvas('3:4'), { w: 1080, h: 1440 });
  assert.deepEqual(safeBox('3:4'), { x: 50, y: 180, w: 910, h: 1080 });
});
test('4:5 ad-safe canvas is 1350 tall with the same margins', () => {
  assert.deepEqual(canvas('4:5'), { w: 1080, h: 1350 });
  assert.equal(safeBox('4:5').h, 990);
});
test('short text keeps its largest size', () => {
  const r = fitText('Stop doing this now', { box: { w: 910, h: 1080 }, maxPx: 120, minPx: 64, lineHeight: 1.05, charWidth: 0.5 });
  assert.equal(r.px, 120); assert.equal(r.fits, true);
});
test('very long text shrinks to the floor and is flagged', () => {
  const r = fitText('word '.repeat(400), { box: { w: 910, h: 1080 }, maxPx: 120, minPx: 64, lineHeight: 1.05, charWidth: 0.5 });
  assert.equal(r.px, 64); assert.equal(r.fits, false);
});
test('banned phrases match whole words regardless of case', () => {
  assert.deepEqual(findBanned('We Leverage AI', DEFAULT_BANNED), ['leverage']);
  assert.deepEqual(findBanned('cleverage', DEFAULT_BANNED), []);
  assert.deepEqual(findBanned("Here's the thing, let's dive in", DEFAULT_BANNED).sort(), ["here's the thing", "let's dive in"]);
});
test('em dashes and spaced en dashes become commas', () => {
  assert.equal(stripDashes('fast—cheap'), 'fast, cheap');
  assert.equal(stripDashes('fast — cheap'), 'fast, cheap');
  assert.equal(stripDashes('fast – cheap'), 'fast, cheap');
  assert.equal(stripDashes('2024–2026'), '2024–2026');
});
