import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mapLeadResearch, createLeadResearchRefresher, shouldRefreshLeadResearch, summarizeLeadResearch, safeResearchUrl, LEAD_REFRESH_MS } from '../src/lib/server/lead-research.ts';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/lead-research.json', import.meta.url), 'utf8'));
const empty = () => ({ companies: [], people: [], opportunities: [], evidence: [], runLog: [], checkedAt: null, attemptedAt: null, error: null });
test('maps SQL dates, relation IDs, tags, drafts and zero scores without discarding low scores', () => {
  const d = mapLeadResearch(fixture);
  assert.equal(d.companies.length, 2);
  assert.equal(d.companies[0].score, 0);
  assert.equal(d.companies[1].score, null);
  assert.equal(d.companies[0].dateAdded, '2026-10-20');
  assert.deepEqual(d.companies[0].tags, ['Shopify', 'No video seen']);
  assert.equal(d.companies[0].drafts.email, 'Fixture draft only');
  assert.equal(d.companies[0].scoreParts, 'Service fit: 0');
  assert.equal(d.companies[0].origin, 'Manual');
  assert.equal(d.companies[0].website, '');
  assert.equal(d.companies[0].peopleIds[0], d.people[0].id);
  assert.equal(d.evidence[0].companyIds[0], d.companies[0].id);
  assert.equal(d.evidence[0].observedDate, '2026-10-20');
  assert.equal(d.runLog[0].costUsd, 0.25);
  assert.equal(d.runLog[1].costUsd, null);
});
test('rejects partial snapshots and invalid Notion rows instead of erasing a good cache', () => {
  assert.throws(() => mapLeadResearch({ ...fixture, evidence: null }));
  assert.throws(() => mapLeadResearch({ ...fixture, ok: false }));
  assert.throws(() => mapLeadResearch({ ...fixture, companies: [{ url: 'https://evil.test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] }));
  assert.equal(safeResearchUrl('data:text/html,bad'), '');
});
test('counts are truthful, retain do not contact and unknown costs, use New York month boundaries', () => {
  const d = summarizeLeadResearch({ ...empty(), ...mapLeadResearch(fixture) }, new Date('2026-10-20T12:00:00Z'));
  assert.equal(d.counts.companies, 2);
  assert.equal(d.counts.newToReview, 1);
  assert.equal(d.counts.monthCostUsd, 0.25);
  assert.equal(d.counts.monthUnknownCosts, 1);
  const boundary = { ...empty(), runLog: [{ ...d.runLog[0], started: '2026-11-01T01:00:00Z' }] };
  assert.equal(summarizeLeadResearch(boundary, new Date('2026-10-31T23:00:00Z')).counts.monthCostUsd, 0.25);
});
test('failed refresh preserves all cached rows and throttles retries for 30 minutes', async () => {
  let state = { ...empty(), ...mapLeadResearch(fixture), checkedAt: '2026-10-19T12:00:00Z' };
  let now = Date.parse('2026-10-20T12:00:00Z'), calls = 0;
  const refresh = createLeadResearchRefresher({ read: () => state, write: s => { state = s; }, now: () => now, run: async () => { calls++; throw Error('SECRET token must not leak'); } });
  await refresh();
  assert.equal(state.companies.length, 2);
  assert.equal(state.checkedAt, '2026-10-19T12:00:00Z');
  assert.ok(!state.error.includes('SECRET'));
  assert.equal((await refresh()).skipped, true);
  assert.equal(calls, 1);
  now += LEAD_REFRESH_MS - 1;
  assert.equal((await refresh()).skipped, true);
  now++;
  await refresh();
  assert.equal(calls, 2);
  await refresh(true);
  assert.equal(calls, 3);
});
test('success replaces complete snapshot; concurrent force refresh cannot duplicate work', async () => {
  let state = empty(), release, calls = 0;
  const refresh = createLeadResearchRefresher({ read: () => state, write: s => { state = s; }, now: () => Date.parse('2026-10-20T12:00:00Z'), run: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const first = refresh();
  assert.equal((await refresh(true)).skipped, true);
  assert.equal(calls, 1);
  release(fixture);
  await first;
  assert.equal(state.companies.length, 2);
  assert.equal(state.checkedAt, state.attemptedAt);
  assert.equal(state.error, null);
  assert.equal(shouldRefreshLeadResearch(state, false, Date.parse(state.attemptedAt) + 1), false);
});
test('required mapped Notion properties match the Python schema; new optional fields remain backward compatible', () => {
  const schemaPath = path.join(os.homedir(), 'Desktop/LYFE WITH MARCUS/AI Content Business/lead-research/src/leadresearch/notion_schema.py');
  const schema = JSON.parse(execFileSync('python3', ['-c', 'import runpy,json,sys;print(json.dumps(runpy.run_path(sys.argv[1])["SCHEMA"]))', schemaPath], { encoding: 'utf8' }));
  const expected = {
    companies: ['Name', 'Segment', 'Entity Type', 'Website', 'Website Status', 'Website Findings', 'General Business Email', 'General Business Phone', 'Contact Form', 'Address', 'Tags', 'Priority Score', 'Confidence', 'Contactability', 'Outreach Status', 'First Found', 'Last Checked', 'People', 'Opportunities', 'Evidence'],
    people: ['Name', 'Current Title', 'Public Individual Business Email', 'Public Direct Business Phone', 'Company', 'Role Evidence URL'],
    opportunities: ['Name', 'Source Platform', 'Source URL', 'Observed Date', 'Company'],
    evidence: ['Title', 'Source URL', 'Observed Date', 'Observation', 'Companies'],
    run_log: ['Run Name', 'Started', 'Cost USD', 'Errors', 'Results Found'],
  };
  for (const [table, properties] of Object.entries(expected)) for (const property of properties) assert.ok(property in schema[table], `${table}.${property}`);
});

test('known Notion query limit gets an honest safe message without erasing cache', async () => {
  let state={...empty(), ...mapLeadResearch(fixture)};
  const refresh=createLeadResearchRefresher({read:()=>state,write:v=>{state=v;},now:()=>0,run:async()=>({ok:false,code:'rate_limited',error:'RAW SECRET'})});
  await refresh();
  assert.match(state.error,/query allowance is exhausted/);
  assert.equal(state.companies.length,2);
  assert.ok(!state.error.includes('SECRET'));
});
