import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { CutlineError } from './cutline-cloud-core.mjs';
import { validateCutlineDocument } from './cutline-cloud-compiler.mjs';
import { probeMP4, UPLOAD_BYTES, DIRECT_UPLOAD_BYTES } from './cutline-cloud-media.mjs';
const safeId = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
const requireId = v => { if (!safeId(v)) throw new CutlineError('INVALID_PROJECT', 'Invalid project identifier.'); };
export function sourcePath(owner, id) { requireId(owner); requireId(id); return `cutline/private/${owner}/projects/${id}/source.mp4`; }
const publicHead = p => ({ id: p.id, title: p.title, revision: p.revision, updatedAt: p.updatedAt, video: p.video });
export function createCutlineProjects({ blob, repository, credentialOptions = {}, now = Date.now, makeId = randomUUID }) {
  async function put(pathname, body, contentType) { await blob.put(pathname, body, { ...credentialOptions, access: 'private', contentType, addRandomSuffix: false, allowOverwrite: false }); }
  async function get(pathname, max) {
    const result = await blob.get(pathname, { ...credentialOptions, access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || result.blob.pathname !== pathname || result.blob.size > max) throw new CutlineError('PROJECT_UNAVAILABLE', 'Private project data unavailable.', 503);
    const reader = result.stream.getReader(); const chunks = []; let bytes = 0;
    try { while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > max) { await reader.cancel(); throw new CutlineError('PROJECT_TOO_LARGE', 'Private project exceeds its limit.', 503); } chunks.push(Buffer.from(value)); } } finally { reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
  async function docAt(record) {
    if (record.doc) return structuredClone(record.doc); // Existing pre-ingestion revisions.
    const expected = `cutline/private/${record.owner}/projects/${record.id}/revisions/`;
    if (!record.docPath?.startsWith(expected) || !/^[a-zA-Z0-9_-]+\.json$/.test(record.docPath.slice(expected.length))) throw new CutlineError('INVALID_PROJECT', 'Invalid private revision reference.', 503);
    return JSON.parse((await get(record.docPath, 1024 * 1024)).toString('utf8'));
  }
  async function append(owner, id, baseRevision, doc, title, prior) {
    const docPath = `cutline/private/${owner}/projects/${id}/revisions/${makeId()}.json`;
    await put(docPath, JSON.stringify(doc), 'application/json');
    try { const record = await repository.append(owner, id, baseRevision, { title, video: doc.video, assetPath: sourcePath(owner, id), docPath, updatedAt: now(), createdAt: prior?.createdAt || now() }); return { ...publicHead(record), doc }; }
    catch (error) { /* Preserve unattached private revision bytes for owner reconciliation. */ throw error; }
  }
  return {
    docAt,
    readPrivate: get,
    list: async owner => (await repository.list(owner)).map(publicHead),
    async create(owner, content, mime, name, verifiedUpload = undefined) {
      requireId(owner); const video = probeMP4(content, mime, verifiedUpload ? DIRECT_UPLOAD_BYTES : UPLOAD_BYTES); const id = verifiedUpload?.projectId || makeId(); requireId(id);
      const title = typeof name === 'string' ? name.replace(/[\x00-\x1f<>]/g, '').slice(0, 100).trim() || 'Untitled video' : 'Untitled video';
      const doc = { id, video: { ...video, src: `projects/${id}/assets/source.mp4` }, words: [], captions: [], preset: 'Gold Punch', style: {}, settings: { wordsPerCaption: 'auto', mood: 60, maxChars: 32, caseMode: 'asis', removePunct: false, minDur: 0.6, maxDur: 3, gap: 0.15, keepFaceClear: true, sound: 'none', scale: 1 }, face: { x: 0.33, y: 0.18, w: 0.34, h: 0.24 }, faceTrack: null, sceneCuts: [], transitions: [], speakers: [{ name: 'Speaker 1' }, { name: 'Speaker 2' }] };
      if (verifiedUpload && (verifiedUpload.owner !== owner || verifiedUpload.path !== sourcePath(owner, id))) throw new CutlineError('UPLOAD_OWNERSHIP', 'Upload does not belong to this project.');
      if (!verifiedUpload) await put(sourcePath(owner, id), content, 'video/mp4');
      try { return await append(owner, id, 0, doc, title); } catch (error) { /* Preserve newly uploaded media; never auto-delete a user's source. */ throw error; }
    },
    async load(owner, id) { requireId(owner); requireId(id); const record = await repository.latest(owner, id); return { ...publicHead(record), doc: await docAt(record) }; },
    async save(owner, id, baseRevision, document) {
      requireId(owner); requireId(id); const prior = await repository.latest(owner, id);
      if (!Number.isSafeInteger(baseRevision) || baseRevision !== prior.revision) throw new CutlineError('REVISION_CONFLICT', 'A newer revision exists. Reload before saving.', 409);
      const doc = structuredClone(document); if (doc?.id !== id) throw new CutlineError('INVALID_PROJECT', 'Project id does not match.');
      doc.video = structuredClone(prior.video); delete doc.__times; delete doc.__cloudRevision;
      validateCutlineDocument(doc);
      if (Buffer.byteLength(JSON.stringify(doc)) > 1024 * 1024) throw new CutlineError('DOCUMENT_TOO_LARGE', 'Caption document exceeds 1 MiB.', 413);
      return append(owner, id, baseRevision, doc, prior.title, prior);
    },
    async source(owner, id, range) {
      requireId(owner); requireId(id); const record = await repository.latest(owner, id);
      if (record.assetPath !== sourcePath(owner, id)) throw new CutlineError('INVALID_PROJECT', 'Invalid owned media reference.', 503);
      const result = await blob.get(record.assetPath, { ...credentialOptions, access: 'private', useCache: false });
      if (!result || result.statusCode !== 200 || result.blob.pathname !== record.assetPath || result.blob.size < 1 || result.blob.size > DIRECT_UPLOAD_BYTES) throw new CutlineError('SOURCE_UNAVAILABLE', 'Private source unavailable.', 503);
      const size = result.blob.size; const headers = { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
      if (!range) return new Response(result.stream, { headers: { ...headers, 'Content-Length': String(size) } });
      const match = /^bytes=(\d*)-(\d*)$/.exec(range); let start = match?.[1] ? Number(match[1]) : 0; let end = match?.[2] ? Number(match[2]) : size - 1;
      if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
      if (!match || (!match[1] && !match[2]) || start > end || start >= size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) { await result.stream.cancel(); return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } }); }
      end = Math.min(end, size - 1); const reader = result.stream.getReader(); let offset = 0; let closed = false;
      const partial = new ReadableStream({
        async pull(controller) {
          try {
            while (!closed) {
              const { value, done } = await reader.read();
              if (done) { closed = true; controller.close(); return; }
              const from = Math.max(0, start - offset); const to = Math.min(value.length, end + 1 - offset); offset += value.length;
              if (to > from) controller.enqueue(value.subarray(from, to));
              if (offset > end) { closed = true; await reader.cancel(); controller.close(); return; }
              if (to > from) return;
            }
          } catch (error) { closed = true; controller.error(error); await reader.cancel().catch(() => {}); }
        },
        async cancel() { closed = true; await reader.cancel(); },
      });
      return new Response(partial, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
    },
    async srt(owner, id) {
      const { doc } = await this.load(owner, id); const engine = await readFile(new URL('../../../public/cutline-assets/engine.js', import.meta.url)); const context = vm.createContext({}); vm.runInContext(engine.toString('utf8'), context, { timeout: 1000 }); context.__doc = doc;
      return vm.runInContext('CaptionEngine.toSRT(__doc)', context, { timeout: 1000 });
    },
    async library(owner, kind) { requireId(owner); if (!['styles', 'layouts'].includes(kind)) throw new CutlineError('INVALID_LIBRARY', 'Unknown library.'); return repository.library(owner, kind); },
    async saveLibrary(owner, kind, item) {
      requireId(owner); if (!['styles', 'layouts'].includes(kind) || !item || typeof item.name !== 'string' || !/^[a-zA-Z0-9 _-]{1,80}$/.test(item.name) || ['__proto__', 'constructor', 'prototype'].includes(item.name.trim()) || Buffer.byteLength(JSON.stringify(item)) > 65536) throw new CutlineError('INVALID_LIBRARY', 'Invalid saved library item.');
      validateCutlineDocument({ video: { duration: 1, w: 16, h: 16 }, words: [], captions: [], settings: {}, item });
      return repository.saveLibrary(owner, kind, item);
    },
  };
}
