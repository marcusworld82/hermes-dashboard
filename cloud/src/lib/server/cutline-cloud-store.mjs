import { CutlineError } from './cutline-cloud-core.mjs';
const key = 'cutline/private/state-v1.json';
const empty = () => ({ version: 1, jobs: {}, reservations: {}, spentCents: {}, projects: {}, heads: {}, libraries: {}, uploads: {} });
const owned = (state, owner, id) => state.jobs[id]?.owner === owner ? state.jobs[id] : null;
/** Private Blob ETag CAS. Every budget/claim is persisted before provisioning.
 * All storage failures (including quota suspension) propagate; never reset state.
 */
export function createCutlineBlobBackend({ blob, credentialOptions = {}, approvedBudget, now = Date.now }) {
  if (approvedBudget && (!Number.isSafeInteger(approvedBudget.perJobCents) || approvedBudget.perJobCents <= 0 || !Number.isSafeInteger(approvedBudget.dailyCents) || approvedBudget.dailyCents < approvedBudget.perJobCents || !Number.isSafeInteger(approvedBudget.concurrency) || approvedBudget.concurrency < 1 || approvedBudget.concurrency > 3)) throw new CutlineError('BUDGET_REQUIRED', 'Explicit per-job, daily and concurrency limits are required.', 503);
  const day = () => new Date(now()).toISOString().slice(0, 10);
  async function read() {
    const result = await blob.get(key, { ...credentialOptions, access: 'private', useCache: false });
    if (!result) return { state: empty(), etag: undefined };
    if (result.statusCode !== 200 || result.blob.size > 8 * 1024 * 1024) throw new CutlineError('STORAGE_UNAVAILABLE', 'Invalid queue storage response.', 503);
    const state = await new Response(result.stream).json();
    if (state.version !== 1 || !state.jobs || !state.reservations || !state.projects || !state.spentCents) throw new CutlineError('STORAGE_INVALID', 'Queue storage schema mismatch.', 503);
    state.heads ||= {}; state.libraries ||= {}; state.uploads ||= {};
    return { state, etag: result.blob.etag };
  }
  async function transaction(change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { state, etag } = await read(); const result = change(state);
      try {
        const serialized = JSON.stringify(state); if (Buffer.byteLength(serialized) > 8 * 1024 * 1024) throw new CutlineError('STORAGE_FULL', 'Project index is full; retain or archive old revisions before continuing.', 503);
        await blob.put(key, serialized, { ...credentialOptions, access: 'private', addRandomSuffix: false, allowOverwrite: !!etag, contentType: 'application/json', ...(etag ? { ifMatch: etag } : {}) });
        return structuredClone(result);
      } catch (error) {
        if (error?.name !== 'BlobPreconditionFailedError' && !/already exists/i.test(error?.message || '')) throw error;
      }
    }
    throw new CutlineError('STORAGE_CONFLICT', 'Queue is busy; no render was started.', 409);
  }
  return {
    store: {
      async get(owner, id) { return owned((await read()).state, owner, id); },
      create(job) { return transaction(state => { const prior = Object.values(state.jobs).find(j => j.owner === job.owner && j.requestId === job.requestId); if (prior) return prior; state.jobs[job.id] = job; return job; }); },
      claim(owner, id, time, leaseMs) { return transaction(state => { const job = owned(state, owner, id); if (!job || job.state !== 'queued') return null; job.state = 'running'; job.leaseUntil = time + leaseMs; job.updatedAt = time; return job; }); },
      finish(owner, id, change) { return transaction(state => { const job = owned(state, owner, id); if (!job || job.state !== 'running') throw new CutlineError('JOB_STATE', 'Job is no longer running.', 409); Object.assign(job, change); return job; }); },
      interruptExpired() { return transaction(state => { const ids = []; for (const j of Object.values(state.jobs)) if (j.state === 'running' && j.leaseUntil < now()) { j.state = 'interrupted'; j.errorCode = 'WORKER_INTERRUPTED'; j.updatedAt = now(); ids.push(j.id); } return ids; }); },
      cancel(owner, id) { return transaction(state => { const j = owned(state, owner, id); if (!j || j.state !== 'queued') throw new CutlineError('CANCEL_UNAVAILABLE', 'Only queued jobs can be cancelled here; running jobs require provider stop.', 409); j.state = 'cancelled'; j.updatedAt = now(); return j; }); },
    },
    budget: {
      reserve({ owner, jobId }) { if (!approvedBudget) throw new CutlineError('BUDGET_REQUIRED', 'Approved budget required.', 503); return transaction(state => {
        const job = owned(state, owner, jobId); if (!job || job.state !== 'running') throw new CutlineError('JOB_STATE', 'Owned running job required.');
        if (state.reservations[jobId]) throw new CutlineError('NO_REPLAY', 'A job reservation cannot be replayed.');
        const reservations = Object.values(state.reservations); const active = reservations.filter(r => !r.settled);
        const exposure = reservations.filter(r => r.day === day()).reduce((sum, r) => sum + r.cents, 0);
        if (active.length >= approvedBudget.concurrency || exposure + approvedBudget.perJobCents > approvedBudget.dailyCents) return null;
        state.reservations[jobId] = { owner, jobId, day: day(), cents: approvedBudget.perJobCents, settled: false };
        return jobId;
      }); },
      settle({ reservation, cleanupFailed }) { return transaction(state => { const r = state.reservations[reservation]; if (!r) throw new CutlineError('BUDGET_STATE', 'Reservation missing.'); r.settled = !cleanupFailed; r.cleanupFailed = cleanupFailed; return r; }); },
    },
    uploads: {
      create(record) { return transaction(state => { const pending = Object.values(state.uploads).filter(u => ['pending','token-issued','validating'].includes(u.state) && u.expiresAt > now()); if (pending.length >= 3 || Object.keys(state.uploads).length >= 500) throw new CutlineError('UPLOAD_CAPACITY', 'Pending upload capacity reached. Complete existing uploads or ask the owner to review retention.', 409); state.uploads[record.id] = record; return record; }); },
      async get(owner, id) { const record = (await read()).state.uploads[id]; if (!record || record.owner !== owner) throw new CutlineError('UPLOAD_NOT_FOUND', 'Owned upload not found.', 404); return record; },
      issue(owner, id, path) { return transaction(state => { const u = state.uploads[id]; if (!u || u.owner !== owner || u.path !== path || u.state !== 'pending' || u.expiresAt <= now()) throw new CutlineError('UPLOAD_TOKEN_DENIED', 'Upload token is expired, issued or not owned.', 409); u.state = 'token-issued'; return u; }); },
      claim(owner, id) { return transaction(state => { const u = state.uploads[id]; if (!u || u.owner !== owner || u.state !== 'token-issued' || u.expiresAt <= now()) throw new CutlineError('UPLOAD_FINALIZE_DENIED', 'Upload cannot be finalized. Start a new upload if its token expired.', 409); u.state = 'validating'; return u; }); },
      finish(owner, id, change) { return transaction(state => { const u = state.uploads[id]; if (!u || u.owner !== owner || u.state !== 'validating') throw new CutlineError('UPLOAD_STATE', 'Upload validation is not active.', 409); Object.assign(u, change); return u; }); },
    },
    repository: {
      async list(owner) { return Object.values((await read()).state.heads).filter(p => p.owner === owner).sort((a,b) => b.updatedAt-a.updatedAt); },
      async latest(owner, id) { const p = (await read()).state.heads[`${owner}:${id}`]; if (!p || p.owner !== owner) throw new CutlineError('PROJECT_NOT_FOUND', 'Project not found.', 404); return p; },
      append(owner, id, baseRevision, record) { return transaction(state => { const k = `${owner}:${id}`; const prior = state.heads[k]; if (!prior && Object.keys(state.heads).length >= 200) throw new CutlineError('PROJECT_CAPACITY', 'Cloud project capacity reached. Ask the owner to review storage retention.', 409); if ((prior?.revision || 0) !== baseRevision) throw new CutlineError('REVISION_CONFLICT', 'A newer revision exists. Reload before saving; your changes were not overwritten.', 409); const next = { ...record, owner, id, revision: baseRevision + 1 }; state.heads[k] = next; state.projects[`${k}:${next.revision}`] = next; return next; }); },
      async library(owner, kind) { return Object.values((await read()).state.libraries[`${owner}:${kind}`] || {}); },
      saveLibrary(owner, kind, item) { return transaction(state => { const k = `${owner}:${kind}`; state.libraries[k] ||= {}; if (Object.keys(state.libraries[k]).length >= 200 && !state.libraries[k][item.name]) throw new CutlineError('LIBRARY_FULL', 'Saved library limit reached.', 409); state.libraries[k][item.name] = item; return item; }); },
    },
    projects: {
      async authorize(owner, id, revision) { const project = (await read()).state.projects[`${owner}:${id}:${revision}`]; if (!project || project.owner !== owner) throw new CutlineError('PROJECT_NOT_FOUND', 'Owned project revision not found.', 404); return project; },
      saveRevision(owner, id, revision, doc, assetPath) { return transaction(state => { if (!/^[a-zA-Z0-9_-]{1,64}$/.test(owner) || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !Number.isSafeInteger(revision) || revision < 1 || assetPath !== `cutline/private/${owner}/projects/${id}/source.mp4`) throw new CutlineError('INVALID_PROJECT', 'Invalid project metadata.'); const projectKey = `${owner}:${id}:${revision}`; if (state.projects[projectKey]) throw new CutlineError('IMMUTABLE_REVISION', 'Project revision already exists.', 409); state.projects[projectKey] = { owner, id, revision, doc, assetPath }; return state.projects[projectKey]; }); },
    },
  };
}
