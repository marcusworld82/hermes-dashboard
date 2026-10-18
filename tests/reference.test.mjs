import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchReference, isPrivateIp } from '../src/lib/server/reference.ts';

test('private, loopback, link-local, CGNAT and mapped addresses are blocked', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.5', '169.254.169.254', '100.100.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '0.0.0.0']) assert.equal(isPrivateIp(ip), true, ip);
  assert.equal(isPrivateIp('93.184.216.34'), false);
});
test('a public name that resolves to a private address is refused before fetching', async () => {
  let fetched = false;
  await assert.rejects(() => fetchReference('https://evil.example/', async () => { fetched = true; }, async () => [{ address: '10.0.0.5', family: 4 }]), /private address/);
  assert.equal(fetched, false);
});
test('a redirect to a private address is refused', async () => {
  const lookup = async (h) => [{ address: h === 'ok.example' ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  const fetcher = async () => new Response(null, { status: 302, headers: { location: 'https://inside.example/admin' } });
  await assert.rejects(() => fetchReference('https://ok.example/', fetcher, lookup), /private address/);
});
test('plain http links are refused', async () => {
  await assert.rejects(() => fetchReference('http://ok.example/'), /https/);
});
