import test from 'node:test';
import assert from 'node:assert/strict';
import { tickSupervisor } from '../scripts/supervisor-tick.mjs';

test('a failed route is recorded and does not stop the scheduler or later checks', async () => {
  const calls = [];
  const result = await tickSupervisor(async (url, options) => {
    calls.push({url, options});
    return new Response('{}', {status: calls.length === 1 ? 503 : 200});
  });
  assert.equal(result.routes.length, 4);
  assert.equal(result.routes[0].ok, false);
  assert.equal(result.routes[1].ok, true);
  assert.equal(result.routes[0].error, 'HTTP 503');
  assert.ok(calls.every(c => c.options.method === 'POST'));
  assert.ok(calls.every(c => c.options.headers.origin === new URL(c.url).origin));
  assert.ok(result.checkedAt);
});

test('network errors do not leak response bodies or skip other routes', async () => {
  let count = 0;
  const result = await tickSupervisor(async () => {
    if (++count === 1) throw Error('secret-bearing upstream detail');
    return new Response('{}');
  });
  assert.equal(count, 4);
  assert.equal(result.routes[0].error, 'Local dashboard request failed');
  assert.equal(result.routes[3].ok, true);
});
