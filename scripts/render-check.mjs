// Renders every carousel template and layout through a running Hermes dev server and checks each PNG is 1080x1440.
// Usage: HERMES_URL=http://127.0.0.1:3210 node scripts/render-check.mjs <output-folder>
const B = process.env.HERMES_URL || "http://127.0.0.1:3210";
const H = { 'content-type': 'application/json', origin: B };
const out = process.argv[2];
import fs from 'node:fs';
const tpls = ['moola','bookworm','brock','ironpress','sketch','greg','electro','passenger','mumbai','courtside','printo','earlybird','bubblegum','scratch','ledger','matchbox','concrete','point','suave','forest','matcha','skyline'];
const jobs = [{ mode: 'screenshot', template: 'screenshot' }, ...tpls.map(t => ({ mode: 'creative', template: t })),
  ...['split','single','hook','before-after','started-going'].map(l => ({ mode: 'photo', template: 'photo', layout: l })),
  ...['cover','story'].map(l => ({ mode: 'editorial', template: 'editorial', layout: l }))];
const slides = (layout = 'default') => [
  { id: 'a', kind: 'cover', layout, headline: 'Stop saving money the *old* way', body: 'Nobody tells you this in school', images: [], textScale: 1, dim: 40, showHandle: true },
  { id: 'b', kind: 'body', layout, headline: 'Pay yourself *first*', body: 'Move 10% to savings the day you get paid, before rent, before food, before anything else. Automate it so you never have to decide.', images: [], textScale: 1, dim: 40, showHandle: true },
];
const ids = [];
let bad = 0;
for (const j of jobs) {
  const r = await fetch(B + '/api/social/carousels', { method: 'POST', headers: H, body: JSON.stringify({ title: 'Render check', mode: j.mode, template: j.template }) });
  const { carousel } = await r.json(); ids.push(carousel.id);
  await fetch(`${B}/api/social/carousels/${carousel.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ slides: slides(j.layout), useBrandColors: false }) });
  for (const n of [0, 1]) {
    const res = await fetch(`${B}/api/social/carousels/${carousel.id}/slides/${n}?preview=1`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ok = res.status === 200 && buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) === 1440;
    if (!ok) { bad++; console.log('FAIL', j.template, j.layout ?? '', n, res.status, buf.toString().slice(0, 300)); continue; }
    fs.writeFileSync(`${out}/${String(jobs.indexOf(j)).padStart(2,'0')}-${j.template}${j.layout ? '-' + j.layout : ''}-${n}.png`, buf);
    const flags = JSON.parse(decodeURIComponent(res.headers.get('x-slide-flags') || '[]'));
    if (flags.length) console.log('flags', j.template, n, flags);
  }
}
for (const id of ids) await fetch(`${B}/api/social/carousels/${id}`, { method: 'DELETE', headers: { origin: B } });
console.log('done, failures:', bad);
