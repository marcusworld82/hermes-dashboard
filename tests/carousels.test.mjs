import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.HERMES_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-carousels-'));
const c = await import('../src/lib/server/carousels.ts');

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

test('a new carousel starts as a Lyfe draft with the default settings', () => {
  const car = c.createCarousel({ title: 'Money habits' });
  assert.equal(car.brandId, 'lyfe'); assert.equal(car.size, '3:4'); assert.equal(car.inputs.slideCount, 7); assert.equal(car.status, 'draft');
});
test('updates persist and the list is newest first', async () => {
  const a = c.createCarousel({ title: 'A' });
  await new Promise((r) => setTimeout(r, 5));
  const b = c.createCarousel({ title: 'B' });
  await new Promise((r) => setTimeout(r, 5));
  c.updateCarousel(a.id, { title: 'A2', inputs: { ...a.inputs, slideCount: 5 } });
  assert.equal(c.getCarousel(a.id).title, 'A2');
  assert.equal(c.getCarousel(a.id).inputs.slideCount, 5);
  assert.equal(c.listCarousels()[0].id, a.id);
  assert.ok(c.listCarousels().some((x) => x.id === b.id));
});
test('slide count stays between 3 and 10', () => {
  const a = c.createCarousel({});
  assert.throws(() => c.updateCarousel(a.id, { inputs: { ...a.inputs, slideCount: 14 } }), /3 to 10/);
});
test('only JPG, PNG or WebP images up to 15 MB are saved', () => {
  assert.throws(() => c.saveMedia(png, 'image/gif', 'x.gif'), /Use JPG, PNG or WebP/);
  assert.throws(() => c.saveMedia(Buffer.alloc(16 * 1024 * 1024), 'image/png', 'big.png'), /15 MB or smaller/);
  assert.throws(() => c.saveMedia(Buffer.from('not an image at all'), 'image/png', 'fake.png'), /isn't a real/);
  const { file } = c.saveMedia(png, 'image/png', 'ok.png');
  assert.match(file, /^[a-z0-9_-]+\.png$/);
  assert.equal(c.readMedia(file).mime, 'image/png');
});
test('media names cannot reach outside the media folder', () => {
  assert.throws(() => c.readMedia('../x.png'), /Unknown image/);
  assert.throws(() => c.readMedia('a/b.png'), /Unknown image/);
});
