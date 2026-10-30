import { CutlineError } from './cutline-cloud-core.mjs';
const key = 'cutline/private/state-v1.json';
const empty = () => ({ version: 1, jobs: {}, reservations: {}, spentCents: {}, projects: {} });
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
    return { state, etag: result.blob.etag };
  }
  async function transaction(change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { state, etag } = await read(); const result = change(state);
      try {
        await blob.put(key, JSON.stringify(state), { ...credentialOptions, access: 'private', addRandomSuffix: false, allowOverwrite: !!etag, contentType: 'application/json', ...(etag ? { ifMatch: etag } : {}) });
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
    projects: {
      async authorize(owner, id, revision) { const project = (await read()).state.projects[`${owner}:${id}:${revision}`]; if (!project || project.owner !== owner) throw new CutlineError('PROJECT_NOT_FOUND', 'Owned project revision not found.', 404); return project; },
      saveRevision(owner, id, revision, doc, assetPath) { return transaction(state => { if (!/^[a-zA-Z0-9_-]{1,64}$/.test(owner) || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !Number.isSafeInteger(revision) || revision < 1 || assetPath !== `cutline/private/${owner}/projects/${id}/source.mp4`) throw new CutlineError('INVALID_PROJECT', 'Invalid project metadata.'); const projectKey = `${owner}:${id}:${revision}`; if (state.projects[projectKey]) throw new CutlineError('IMMUTABLE_REVISION', 'Project revision already exists.', 409); state.projects[projectKey] = { owner, id, revision, doc, assetPath }; return state.projects[projectKey]; }); },
    },
  };
}
