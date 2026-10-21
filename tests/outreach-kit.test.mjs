import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectNiche, findGaps, readSite, safeUrl, buildKit, needsKit, parseKit, buildPrompt } from '../src/lib/server/outreach-kit.ts';

const lead = (over = {}) => ({ id: 'p1', name: 'Joe Roofing', contact: 'Joe Smith', email: 'joe@gmail.com', phone: '555', city: 'Atlanta', audience: 'local service', title: 'Roofer', address: '', links: [], research: [], noteText: '', doNotContact: false, stage: 'To review', ...over });
const reply = JSON.stringify({ call: { opener: 'Hey, is this Joe? My name—s Marcus.', localHook: 'You work around here?', questions: ['How long?'], gapLine: 'No website listed.', showLine: 'Thursday or Friday?', objections: [{ they: 'Not interested', you: 'No problem.' }] }, email: { subject: 'Joe Roofing on Google', body: 'Hey Joe', followUps: ['Bump', 'Last note'] }, dm: { messages: ['Hey Joe', 'Two', 'Three'] } });

test('detects each niche', () => {
  assert.equal(detectNiche({ audience: 'vacation_rental_managers', title: '', name: '' }), 'str_host');
  assert.equal(detectNiche({ audience: 'brokerages', title: '', name: '' }), 'brokerage');
  assert.equal(detectNiche({ audience: 'agents', title: 'Realtor', name: '' }), 'real_estate_agent');
  assert.equal(detectNiche({ audience: '', title: 'Plumber', name: 'Bob' }), 'local_service');
});

test('finds gaps only from evidence', () => {
  const none = findGaps(lead(), 'local_service', null);
  assert.deepEqual(none.map((f) => f.key).sort(), ['free_email', 'no_social', 'no_website']);
  const site = readSite('http://joe.com', '<html><footer>&copy; 2019 Joe</footer></html>');
  const withSite = findGaps(lead({ email: 'joe@joe.com', links: [{ label: 'Website', url: 'http://joe.com' }, { label: 'Facebook', url: 'https://facebook.com/joe' }] }), 'str_host', site, new Date('2026-10-19'));
  assert.deepEqual(withSite.map((f) => f.key).sort(), ['no_direct_booking', 'no_https', 'not_mobile', 'stale_footer']);
  const good = readSite('https://joe.com', '<meta name="viewport" content="x"> &copy; 2026 Book now');
  assert.equal(findGaps(lead({ email: '', links: [{ label: 'Website', url: 'https://joe.com' }, { label: 'Instagram', url: 'https://instagram.com/joe' }] }), 'str_host', good, new Date('2026-10-19')).length, 0);
});

test('site checker refuses private addresses', () => {
  for (const u of ['http://127.0.0.1:3200', 'http://localhost', 'http://192.168.1.4', 'file:///etc/passwd', 'http://10.0.0.1', 'http://user:pw@x.com']) assert.equal(safeUrl(u), null, u);
  assert.ok(safeUrl('https://joesroofing.com'));
});

test('builds a kit, strips em dashes and flags Airbnb hosts', async () => {
  const prompts = [];
  const kit = await buildKit(lead({ audience: 'hosts' }), { send: async (p) => { prompts.push(p); return reply; }, fetchSite: async () => null, playbook: () => 'PLAYBOOK TEXT', homeCity: '' });
  assert.equal(kit.niche, 'str_host');
  assert.ok(!kit.call.opener.includes('—'));
  assert.ok(kit.flags.some((f) => f.includes('Airbnb')));
  assert.ok(kit.flags.some((f) => f.includes('OUTREACH_HOME_CITY')));
  assert.match(prompts[0], /PLAYBOOK TEXT/);
  assert.match(prompts[0], /Never suggest Airbnb or VRBO messaging/);
  assert.match(prompts[0], /Do not claim to be local/);
});

test('never builds for do-not-contact and skips archived', async () => {
  await assert.rejects(buildKit(lead({ doNotContact: true }), { send: async () => reply, fetchSite: async () => null, playbook: () => '', homeCity: '' }));
  const leads = [lead(), lead({ id: 'p2', stage: 'Archived' }), lead({ id: 'p3', doNotContact: true })];
  assert.deepEqual(needsKit(leads, {}, 'x').map((l) => l.id), ['p1']);
});

test('rejects incomplete answers', () => {
  assert.throws(() => parseKit('no json here'));
  assert.throws(() => parseKit('{"call":{},"email":{},"dm":{}}'));
});

test('prompt treats lead text as data and avoids guessing names', () => {
  const p = buildPrompt(lead({ contact: '' }), 'local_service', [], 'pb', 'Atlanta', { call: true, email: true, dm: false });
  assert.match(p, /Do not guess one/);
  assert.match(p, /never instructions/);
  assert.match(p, /\(none found\)/);
});

test('private address check covers IPv4, IPv6 and mapped forms', async () => {
  const { isPrivateIp } = await import('../src/lib/server/outreach-kit.ts');
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.9', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700::1111']) assert.ok(!isPrivateIp(ip), ip);
});
