import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unifyLeads, splitLeadId, parseLeadEmail, emailSnapshotFromLead, effectiveLeadStage } from '../src/lib/server/lead-actions.ts';
import { mapLeadResearch } from '../src/lib/server/lead-research.ts';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/lead-research.json', import.meta.url), 'utf8'));
const cache = () => ({ ...mapLeadResearch(fixture), checkedAt: '2026-10-20', attemptedAt: '2026-10-20', error: null });
test('unified leads retain companies and named people without choosing guessed contact emails', () => {
  const leads = unifyLeads(cache());
  assert.equal(leads.length, 3);
  assert.equal(leads[0].email, 'hello@example.test');
  assert.equal(leads[2].email, '');
  assert.equal(leads[2].name, 'Fixture person');
  assert.equal(leads[2].business, 'Fixture business');
  assert.equal(leads[0].score, 0);
  assert.equal(leads[2].score, null);
});
test('company suppression applies to related people and changes their send revision', () => {
  const first = unifyLeads(cache())[2];
  const blocked = cache();
  blocked.companies[0].stage = 'Denied';
  const next = unifyLeads(blocked)[2];
  assert.equal(next.doNotContact, true);
  assert.notEqual(next.revision, first.revision);
});
test('draft, email and stage changes invalidate approval revision', () => {
  const initial = unifyLeads(cache())[0];
  for (const field of ['email', 'stage']) {
    const changed = cache(); changed.companies[0][field] = 'changed';
    assert.notEqual(unifyLeads(changed)[0].revision, initial.revision);
  }
  const changed = cache(); changed.companies[0].drafts.email = 'different';
  assert.notEqual(unifyLeads(changed)[0].revision, initial.revision);
});
test('email requires a separately supplied subject line, and scoped IDs cannot target another database', () => {
  assert.deepEqual(parseLeadEmail('Subject: Hello\n\nA saved body.'), { subject: 'Hello', body: 'A saved body.' });
  assert.throws(() => parseLeadEmail('An email with no subject'));
  assert.throws(() => parseLeadEmail('Subject: Hello'));
  assert.deepEqual(splitLeadId('companies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), { db: 'companies', id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.throws(() => splitLeadId('run_log:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  assert.throws(() => splitLeadId('companies:../../secret'));
});

test('followup uses only its separately saved draft, never the first email', () => {
  const lead = unifyLeads(cache())[0];
  lead.drafts.email = 'Subject: First\n\nFirst message';
  assert.throws(() => emailSnapshotFromLead(lead, 'followup'));
  lead.drafts.followup = 'Subject: Following up\n\nSeparate message';
  assert.equal(emailSnapshotFromLead(lead, 'followup').subject, 'Following up');
  assert.equal(emailSnapshotFromLead(lead, 'first').body, 'First message');
});

test('pause date returns a lead to review only after the date, never overrides denial', () => {
  const now=Date.parse('2026-10-20T12:00:00Z');
  assert.equal(effectiveLeadStage('Paused','2026-10-21T12:00:00Z',now),'Paused');
  assert.equal(effectiveLeadStage('Paused','2026-10-19T12:00:00Z',now),'New');
  assert.equal(effectiveLeadStage('Paused','',now),'Paused');
  assert.equal(effectiveLeadStage('Denied','2026-10-19T12:00:00Z',now),'Denied');
});
