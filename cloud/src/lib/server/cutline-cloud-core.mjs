import { randomUUID } from 'node:crypto';

export const LIMITS = Object.freeze({ requestBytes: 4096, files: 128, bundleBytes: 128 * 1024 * 1024, outputBytes: 256 * 1024 * 1024, timeoutMs: 240000 });
export class CutlineError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
export function parseRenderRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['projectId', 'revision', 'requestId', 'redoOf'].includes(k))) throw new CutlineError('INVALID_REQUEST', 'Only projectId, revision, requestId and optional redoOf are accepted.');
  if (!id(value.projectId) || !id(value.requestId) || !Number.isSafeInteger(value.revision) || value.revision < 1 || (value.redoOf !== undefined && !id(value.redoOf))) throw new CutlineError('INVALID_REQUEST', 'Invalid project, revision or request identifier.');
  return { ...value };
}
export function validateBundle(files) {
  if (!Array.isArray(files) || files.length < 3 || files.length > LIMITS.files) throw new CutlineError('INVALID_BUNDLE', 'Invalid composition bundle.');
  const names = new Set(); let size = 0;
  for (const file of files) {
    if (!file || typeof file.rel !== 'string' || !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(file.rel) || file.rel.split('/').some(p => p === '.' || p === '..') || names.has(file.rel) || !Buffer.isBuffer(file.content)) throw new CutlineError('INVALID_BUNDLE', 'Unsafe composition path or content.');
    if (!/\.(?:html|js|json|mp4|mp3|wav|woff2)$/.test(file.rel)) throw new CutlineError('INVALID_BUNDLE', 'Unsupported composition asset.');
    names.add(file.rel); size += file.content.length;
  }
  if (size > LIMITS.bundleBytes || !['index.html', 'engine.js', 'assets/source.mp4'].every(n => names.has(n))) throw new CutlineError('INVALID_BUNDLE', 'Composition missing required assets or exceeds size limit.');
  return files;
}
export async function readBoundedJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new CutlineError('CONTENT_TYPE', 'Use application/json.', 415);
  if (Number(request.headers.get('content-length')) > LIMITS.requestBytes) throw new CutlineError('BODY_TOO_LARGE', 'Request too large.', 413);
  const reader = request.body?.getReader(); if (!reader) throw new CutlineError('INVALID_REQUEST', 'Request body required.');
  const chunks = []; let length = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > LIMITS.requestBytes) { await reader.cancel(); throw new CutlineError('BODY_TOO_LARGE', 'Request too large.', 413); } chunks.push(Buffer.from(value)); }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new CutlineError('INVALID_JSON', 'Invalid JSON.'); }
}

/** A worker contract, deliberately not connected to HTTP or an SDK.
 * store must be durable and implement atomic claim/finish and owner-scoped reads.
 * budget.reserve must atomically reserve an explicitly approved per-job maximum;
 * it returns a reservation id, never a client-supplied spending assertion.
 * projects.bundle must resolve an owner-owned immutable revision and create trusted
 * HTML from typed data + the exact preview engine; never accept client HTML/JS/URLs.
 */
export function createRenderWorker({ store, budget, projects, provider, outputs, now = Date.now, timeoutMs = LIMITS.timeoutMs }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > LIMITS.timeoutMs) throw new Error('Invalid worker timeout');
  return {
    async enqueue(owner, input) {
      if (!id(owner)) throw new CutlineError('UNAUTHORIZED', 'Invalid owner.', 401);
      const request = parseRenderRequest(input);
      await projects.authorize(owner, request.projectId, request.revision);
      if (request.redoOf) {
        const previous = await store.get(owner, request.redoOf);
        if (!previous || previous.projectId !== request.projectId || !['failed', 'timed_out', 'interrupted', 'cancelled', 'succeeded'].includes(previous.state)) throw new CutlineError('INVALID_REDO', 'Redo requires an owned, finished job.');
      }
      // create atomically deduplicates owner+requestId, including after interruption.
      return store.create({ id: randomUUID(), owner, ...request, state: 'queued', createdAt: now(), updatedAt: now() });
    },
    async run(owner, jobId) {
      // An expired running lease becomes interrupted, never silently queued again.
      const job = await store.claim(owner, jobId, now(), timeoutMs);
      if (!job) return;
      const controller = new AbortController(); let session; let reservation; let timer; let cleanupFailed = false; let renderStarted = false;
      const started = now();
      const work = async (files) => {
        renderStarted = true;
        session = await provider.restore({ signal: controller.signal, timeoutMs });
        if (controller.signal.aborted) { await session.stop(); controller.signal.throwIfAborted(); }
        const mp4 = await session.render(files, controller.signal);
        controller.signal.throwIfAborted();
        if (!Buffer.isBuffer(mp4) || !mp4.length || mp4.length > LIMITS.outputBytes) throw new CutlineError('INVALID_OUTPUT', 'Renderer output missing or exceeds limit.');
        // outputs stores privately; result is an opaque owner-scoped id, never a URL.
        const outputId = await outputs.putPrivate({ owner, jobId, content: mp4, signal: controller.signal });
        controller.signal.throwIfAborted();
        return outputId;
      };
      try {
        const files = validateBundle(await projects.bundle(owner, job.projectId, job.revision));
        reservation = await budget.reserve({ owner, jobId, timeoutMs });
        if (!reservation) throw new CutlineError('BUDGET_BLOCKED', 'An explicit spending reservation is required.', 503);
        const outputId = await Promise.race([work(files), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new CutlineError('RENDER_TIMEOUT', 'Render timed out.')); }, timeoutMs); })]);
        await store.finish(owner, jobId, { state: 'succeeded', outputId, updatedAt: now() });
      } catch (error) {
        controller.abort();
        if (renderStarted && !session) cleanupFailed = true;
        await store.finish(owner, jobId, { state: error?.code === 'RENDER_TIMEOUT' ? 'timed_out' : 'failed', errorCode: error instanceof CutlineError ? error.code : 'RENDER_FAILED', updatedAt: now() });
      } finally {
        clearTimeout(timer);
        if (session) { try { await session.stop(); } catch { cleanupFailed = true; } }
        // A failed stop retains the entire reservation until reconciled by an operator.
        if (reservation) await budget.settle({ reservation, elapsedMs: now() - started, cleanupFailed });
      }
    },
  };
}
