import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSocialPlan } from '../src/lib/server/social-plan.ts';

const item = { id: 'notion:abc', title: 'A real idea', format: 'reel', brand: 'Marcus Collins', date: '2026-11-01', captions: { instagram: 'One paragraph.\n\nAnother paragraph.' }, sourceUrl: 'https://app.notion.com/p/abc', reviewStatus: 'Needs Ghost QC', body: 'Recording script', issues: ['Asset needed'] };
function withFile(value, check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-plan-test-'));
  try { const file = path.join(dir, 'plan.json'); fs.writeFileSync(file, JSON.stringify(value)); check(file); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('missing planning file leaves the live workspace usable', () => {
  const result = readSocialPlan(path.join(os.tmpdir(), 'no-social-plan-here-73b094.json'));
  assert.equal(result.error, null); assert.deepEqual(result.items, []);
});
test('planned date, source identity, review state and spaced captions survive import', () => {
  withFile({ version: 1, batchId: 'oct19', items: [item] }, file => {
    const result = readSocialPlan(file);
    assert.equal(result.error, null); assert.equal(result.items[0].date, '2026-11-01');
    assert.equal(result.items[0].id, 'notion:abc'); assert.equal(result.items[0].sourceUrl, 'https://app.notion.com/p/abc');
    assert.equal(result.items[0].captions.instagram, 'One paragraph.\n\nAnother paragraph.');
    assert.equal(result.items[0].reviewStatus, 'Needs Ghost QC'); assert.equal(result.items[0].body, 'Recording script');
    assert.equal('deliveries' in result.items[0], false);
  });
});
test('duplicate source IDs reject the batch rather than duplicating calendar cards', () => {
  withFile({ version: 1, batchId: 'oct19', items: [item, item] }, file => {
    const result = readSocialPlan(file); assert.ok(result.error); assert.deepEqual(result.items, []);
  });
});
test('impossible dates and unsafe source URLs cannot enter the calendar', () => {
  for (const bad of [{ ...item, date: '2026-02-30' }, { ...item, sourceUrl: 'javascript:alert(1)' }]) {
    withFile({ version: 1, batchId: 'oct19', items: [bad] }, file => {
      const result = readSocialPlan(file); assert.ok(result.error); assert.deepEqual(result.items, []);
    });
  }
});
test('partial malformed input is reported without returning an incomplete plan', () => {
  withFile({ version: 1, batchId: 'oct19', items: [item, { id: 'broken' }] }, file => {
    const result = readSocialPlan(file); assert.ok(result.error); assert.deepEqual(result.items, []);
  });
});
