import { validSession, sameOrigin } from './security.mjs';
import { CutlineError, parseRenderRequest, readBoundedJson } from './cutline-cloud-core.mjs';
import { cutlineCloudStatus } from './cutline-cloud-status.mjs';
const headers = { 'Cache-Control': 'private, no-store' };
const publicJob = job => ({ id: job.id, projectId: job.projectId, revision: job.revision, state: job.state, createdAt: job.createdAt, updatedAt: job.updatedAt, ...(job.errorCode ? { errorCode: job.errorCode } : {}), ...(job.state === 'succeeded' ? { downloadPath: `/api/cutline-cloud/jobs/${job.id}/output` } : {}) });
export function cutlineCloudOwner(request, env) {
  const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('hermes_session='))?.slice('hermes_session='.length) || '';
  if (!validSession(token, env.HERMES_SESSION_SECRET || '')) throw new CutlineError('UNAUTHORIZED', 'Sign in to Hermes.', 401);
  if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request.headers.get('origin'), request.headers.get('host'))) throw new CutlineError('INVALID_ORIGIN', 'Request origin does not match.', 403);
  // Existing Hermes is single-owner. Never take an owner identifier from client data.
  return 'owner';
}
export function createCutlineHTTP({ env = process.env, loadRuntime, status = async () => cutlineCloudStatus(env) }) {
  return async function handle(request, action, jobId) {
    try {
      const owner = cutlineCloudOwner(request, env);
      if (action === 'status') return Response.json(await status(), { headers });
      if (jobId !== undefined && !/^[a-zA-Z0-9_-]{1,64}$/.test(jobId)) throw new CutlineError('INVALID_JOB', 'Invalid job identifier.');
      let input;
      if (action === 'enqueue') input = parseRenderRequest(await readBoundedJson(request));
      const state = await status();
      const readOnly = ['job', 'output'].includes(action);
      const readBlocked = state.blockerDetails?.some(b => b.code === 'PRIVATE_STORAGE_REQUIRED');
      if ((!readOnly && !state.available) || (readOnly && readBlocked)) return Response.json(state, { status: 503, headers });
      const runtime = await loadRuntime(action);
      if (action === 'enqueue') {
        const job = await runtime.worker.enqueue(owner, input);
        // No paid work is dispatched here. An explicit authenticated dispatch is required.
        return Response.json({ job: publicJob(job), dispatchPath: `/api/cutline-cloud/jobs/${job.id}/dispatch` }, { status: 202, headers });
      }
      if (action === 'dispatch') await runtime.store.interruptExpired?.();
      const job = await runtime.store.get(owner, jobId);
      if (!job) throw new CutlineError('JOB_NOT_FOUND', 'Job not found.', 404);
      if (action === 'job') return Response.json({ job: publicJob(job) }, { headers });
      if (action === 'output') {
        if (job.state !== 'succeeded' || !job.outputId) throw new CutlineError('OUTPUT_NOT_READY', 'Render output is not ready.', 409);
        return runtime.outputs.download(owner, job.outputId, request.signal);
      }
      if (action === 'cancel') return Response.json({ job: publicJob(await runtime.store.cancel(owner, jobId)) }, { headers });
      if (action === 'dispatch') {
        if (job.state !== 'queued') return Response.json({ job: publicJob(job), dispatched: false }, { headers });
        await runtime.worker.run(owner, jobId);
        return Response.json({ job: publicJob(await runtime.store.get(owner, jobId)), dispatched: true }, { headers });
      }
      throw new CutlineError('INVALID_ACTION', 'Unsupported job action.', 404);
    } catch (error) {
      if (error instanceof CutlineError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
      return Response.json({ error: 'Cutline cloud storage, assets or provider is unavailable. No automatic paid retry will occur.', code: 'CLOUD_UNAVAILABLE' }, { status: 503, headers });
    }
  };
}
