import { createHash } from 'node:crypto';
import { CutlineError, LIMITS } from './cutline-cloud-core.mjs';

/** Actual SDK binding; dependency injected for offline testing. No SDK method runs
 * until a separately authorized worker calls restoreSnapshot. */
export function createVercelSandboxSDK({ Sandbox }) {
  return {
    async restoreSnapshot({ snapshotId, timeoutMs, network, signal }) {
      if (network !== 'deny-all') throw new CutlineError('NETWORK_POLICY', 'Renderer requires deny-all egress.');
      signal.throwIfAborted();
      const sandbox = await Sandbox.create({ source: { type: 'snapshot', snapshotId }, timeout: timeoutMs, resources: { vcpus: 2 }, networkPolicy: 'deny-all' });
      if (signal.aborted) { await sandbox.stop(); signal.throwIfAborted(); }
      return {
        stop: () => sandbox.stop(),
        async verifyEngine(content, digest) {
          if (createHash('sha256').update(content).digest('hex') !== digest) throw new CutlineError('ENGINE_MISMATCH', 'Preview and render engines differ.');
        },
        writeFiles: (files, { signal }) => sandbox.writeFiles(files, { signal }),
        runCommand: command => sandbox.runCommand(command),
        readFileToBuffer: ({ path, signal }) => sandbox.readFileToBuffer({ path }, { signal }),
      };
    },
  };
}
const safeId = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(x);
function outputPath(owner, outputId) {
  if (!safeId(owner) || !safeId(outputId)) throw new CutlineError('INVALID_OUTPUT', 'Invalid output identifier.');
  return `cutline/private/${owner}/${outputId}.mp4`;
}
/** Blob private access is mandatory; no URL is returned to clients. Owner identity
 * must come from the authenticated server session, never an API body parameter. */
export function createPrivateBlobOutputs({ blob, credentialOptions = {} }) {
  return {
    async putPrivate({ owner, jobId, content, signal }) {
      const pathname = outputPath(owner, jobId);
      if (!Buffer.isBuffer(content) || !content.length || content.length > LIMITS.outputBytes) throw new CutlineError('INVALID_OUTPUT', 'Invalid render output.');
      signal.throwIfAborted();
      await blob.put(pathname, content, { ...credentialOptions, access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'video/mp4', abortSignal: signal });
      return jobId;
    },
    async download(owner, outputId, signal) {
      const pathname = outputPath(owner, outputId);
      const result = await blob.get(pathname, { ...credentialOptions, access: 'private', useCache: false, abortSignal: signal });
      if (!result || result.statusCode !== 200 || result.blob.pathname !== pathname || result.blob.size > LIMITS.outputBytes) throw new CutlineError('OUTPUT_NOT_FOUND', 'Output not found.', 404);
      return new Response(result.stream, { headers: { 'Content-Type': 'video/mp4', 'Content-Disposition': `attachment; filename="cutline-${outputId}.mp4"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    },
    async remove(owner, outputId) { await blob.del(outputPath(owner, outputId), credentialOptions); },
  };
}
