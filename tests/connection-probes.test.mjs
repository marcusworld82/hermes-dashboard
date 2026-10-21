import test from 'node:test';
import assert from 'node:assert/strict';
import { replyEvidence, probeDetail } from '../src/lib/server/connection-evidence.ts';
import { quoteOpenRouter, generateOpenRouter, runOpenRouterCheck } from '../src/lib/server/connection-probes.ts';

test('agent replies turn stale only after 24 hours and missing evidence fails', () => {
 const now = 2000000000000;
 const health = { checkedAt: (now - 86400000) / 1000, agents: [{ ok: true }] };
 assert.equal(replyEvidence(health, now).ok, true);
 assert.equal(replyEvidence(health, now + 1).ok, false);
 assert.equal(replyEvidence(health, now + 1).stale, true);
 assert.equal(replyEvidence(null, now).ok, false);
});
test('failed authentication is red with its error and check timestamp', () => {
 const result = probeDetail({ ok: false, checkedAt: 1000, error: 'HTTP 401: invalid credential' }, 1000);
 assert.equal(result.ok, false);
 assert.match(result.detail, /HTTP 401: invalid credential/);
 assert.match(result.detail, /1970-01-01T00:00:01/);
 assert.equal(probeDetail(undefined).ok, false);
 assert.equal(probeDetail({ ok: true, checkedAt: 1000 }, 86401001).ok, false);
});
test('pricing is read-only and unapproved generation is blocked', async () => {
 let calls = 0;
 const quote = await quoteOpenRouter(async (url, options) => {
   calls++; assert.equal(options.method, undefined); assert.match(url, /\/models$/);
   return Response.json({ data: [{ id: 'openai/gpt-4o-mini', pricing: { prompt: '0.00000015', completion: '0.0000006' } }] });
 });
 assert.equal(calls, 1);
 assert.ok(quote.estimatedMaxCost < 0.01);
 await assert.rejects(runOpenRouterCheck(1), /fresh cost estimate/);
 await assert.rejects(quoteOpenRouter(async () => Response.json({data: []})), /usable model pricing/);
});
test('tiny live generation uses bounded settings and reports real cost', async () => {
 const result = await generateOpenRouter({ promptPrice: .00000015, completionPrice: .0000006 }, 'fake-test-key', async (url, options) => {
   const input = JSON.parse(options.body);
   assert.equal(input.max_tokens, 8); assert.equal(input.model, 'openai/gpt-4o-mini');
   assert.equal(input.messages.length, 1);
   assert.equal(options.method, 'POST');
   return Response.json({ choices: [{ message: { content: 'OK' } }], usage: { cost: .000005 } });
 });
 assert.equal(result.ok, true); assert.equal(result.cost, .000005);
 const failed = await generateOpenRouter({}, 'fake-test-key', async () => new Response('secret provider body', {status: 401}));
 assert.equal(failed.ok, false); assert.match(failed.error, /HTTP 401/); assert.ok(!failed.error.includes('secret'));
 const missing = await generateOpenRouter({}, 'fake-test-key', async () => Response.json({ choices: [{message: {content: 'OK'}}] }));
 assert.equal(missing.cost, null);
});
