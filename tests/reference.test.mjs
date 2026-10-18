import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchReference, isPrivateIp } from '../src/lib/server/reference.ts';

test('only public addresses pass', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.5', '169.254.169.254', '100.100.1.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fd00::1', 'fe80::1', 'fec0::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::1', '2001:0:1::1', '2001:db8::1', '::127.0.0.1']) assert.equal(isPrivateIp(ip), true, ip);
  assert.equal(isPrivateIp('93.184.216.34'), false);
  assert.equal(isPrivateIp('2606:4700::6810:84e5'), false);
});

const body = (s) => ({ async *[Symbol.asyncIterator]() { yield Buffer.from(s); }, destroy() {} });
// A fake requester that, like the real one, asks the safe lookup where to connect.
const viaLookup = (pages) => (u, safeLookup) => new Promise((resolve, reject) =>
  safeLookup(u.hostname, (err) => (err ? reject(err) : resolve(pages[u.hostname]))));

test('a name that resolves to a private address is refused at connect time', async () => {
  await assert.rejects(() => fetchReference('https://evil.example/', viaLookup({}), async () => [{ address: '10.0.0.5', family: 4 }]), /private address/);
});
test('a redirect to a private address is refused', async () => {
  const lookup = async (h) => [{ address: h === 'ok.example' ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  const pages = { 'ok.example': { status: 302, location: 'https://inside.example/admin', type: '', body: body('') } };
  await assert.rejects(() => fetchReference('https://ok.example/', viaLookup(pages), lookup), /private address/);
});
test('a public page is read as plain text', async () => {
  const pages = { 'ok.example': { status: 200, location: null, type: 'text/html', body: body('<html><script>x()</script><p>Hello &amp; welcome</p></html>') } };
  assert.equal(await fetchReference('https://ok.example/', viaLookup(pages), async () => [{ address: '93.184.216.34', family: 4 }]), 'Hello & welcome');
});
test('plain http and literal private IPs are refused', async () => {
  await assert.rejects(() => fetchReference('http://ok.example/'), /https/);
  await assert.rejects(() => fetchReference('https://127.0.0.1/'), /private address/);
});
