import { CutlineError } from './cutline-cloud-core.mjs';
export const DIRECT_UPLOAD_BYTES = 128 * 1024 * 1024;
export const UPLOAD_BYTES = 4 * 1024 * 1024; // Below Vercel's function request limit.
const bad = message => { throw new CutlineError('INVALID_MEDIA', message, 415); };
function boxes(data, start = 0, end = data.length) {
  const result = []; let cursor = start;
  while (cursor < end) {
    if (end - cursor < 8 || result.length > 10000) bad('Malformed MP4 box structure.');
    let size = data.readUInt32BE(cursor); const type = data.toString('ascii', cursor + 4, cursor + 8); let header = 8;
    if (size === 1) { if (end - cursor < 16) bad('Truncated MP4 box.'); const n = data.readBigUInt64BE(cursor + 8); if (n > BigInt(end - cursor)) bad('MP4 box exceeds file.'); size = Number(n); header = 16; }
    if (size === 0) size = end - cursor;
    if (size < header || cursor + size > end) bad('MP4 box exceeds file.');
    result.push({ type, start: cursor + header, end: cursor + size }); cursor += size;
  }
  return result;
}
export function probeMP4(data, mime, maxBytes = UPLOAD_BYTES) {
  if (mime?.split(';')[0].toLowerCase() !== 'video/mp4' || !Buffer.isBuffer(data) || data.length < 32 || data.length > maxBytes) bad('Upload a valid MP4 within the configured size limit.');
  const top = boxes(data); const ftyp = top.find(b => b.type === 'ftyp'); const moov = top.find(b => b.type === 'moov');
  if (!ftyp || ftyp.end - ftyp.start < 8 || !moov || !top.some(b => b.type === 'mdat') || top.some(b => b.type === 'moof')) bad('Use a complete, non-fragmented MP4 file.');
  const brands = data.toString('ascii', ftyp.start, ftyp.end);
  if (!/(isom|iso[2-9]|mp4[12]|avc1|M4V )/.test(brands)) bad('MP4 signature is unsupported.');
  const children = boxes(data, moov.start, moov.end); const mvhd = children.find(b => b.type === 'mvhd');
  if (!mvhd) bad('MP4 duration metadata is missing.');
  const version = data[mvhd.start]; const timeOffset = version === 0 ? 12 : version === 1 ? 20 : -1;
  if (timeOffset < 0 || mvhd.end - mvhd.start < timeOffset + (version ? 12 : 8)) bad('MP4 duration is invalid.');
  const scale = data.readUInt32BE(mvhd.start + timeOffset); const ticks = version ? Number(data.readBigUInt64BE(mvhd.start + timeOffset + 4)) : data.readUInt32BE(mvhd.start + timeOffset + 4); const duration = ticks / scale;
  if (!scale || !Number.isFinite(duration) || duration <= 0 || duration > 120) bad('Video must be two minutes or shorter.');
  let video;
  for (const trak of children.filter(b => b.type === 'trak')) {
    const track = boxes(data, trak.start, trak.end); const tkhd = track.find(b => b.type === 'tkhd'); const mdia = track.find(b => b.type === 'mdia'); if (!tkhd || !mdia) continue;
    const handler = boxes(data, mdia.start, mdia.end).find(b => b.type === 'hdlr'); if (!handler || handler.end - handler.start < 12 || data.toString('ascii', handler.start + 8, handler.start + 12) !== 'vide') continue;
    const offset = data[tkhd.start] === 0 ? 76 : data[tkhd.start] === 1 ? 88 : -1;
    if (offset < 0 || tkhd.end - tkhd.start < offset + 8) bad('Video dimensions are missing.');
    const w = data.readUInt32BE(tkhd.start + offset) / 65536; const h = data.readUInt32BE(tkhd.start + offset + 4) / 65536;
    if (![w, h].every(n => Number.isInteger(n) && n >= 16 && n <= 1920 && n % 2 === 0)) bad('Video dimensions must be even and between 16 and 1920 pixels.');
    if (video) bad('Multiple video tracks are unsupported.'); video = { w, h, duration: Math.round(duration * 1000) / 1000 };
  }
  if (!video) bad('A video track is required.');
  // This is a structural metadata probe, not a decoder/codec compatibility promise.
  return video;
}
export async function readBoundedBody(request, max = UPLOAD_BYTES) {
  if (Number(request.headers.get('content-length')) > max) throw new CutlineError('BODY_TOO_LARGE', 'Upload exceeds the server limit.', 413);
  const reader = request.body?.getReader(); if (!reader) throw new CutlineError('EMPTY_BODY', 'Upload body required.');
  const parts = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > max) { await reader.cancel(); throw new CutlineError('BODY_TOO_LARGE', 'Upload exceeds the server limit.', 413); } parts.push(Buffer.from(value)); } } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
