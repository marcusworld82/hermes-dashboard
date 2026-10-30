import { CutlineError } from './cutline-cloud-core.mjs';

/** Injection seam modeled on the official Vercel Sandbox template.
 * sdk must implement restoreSnapshot({snapshotId, timeoutMs, network:'deny-all', signal}).
 * Its implementation must configure actual Sandbox network policy, pinned binaries
 * and bounded command output before this adapter can be connected to production.
 * There is intentionally no fresh sandbox / npm install / snapshot creation fallback.
 */
export function createSnapshotProvider({ sdk, snapshotId, approvedEngineDigest }) {
  if (!sdk || !/^[a-zA-Z0-9_-]{1,128}$/.test(snapshotId || '') || !/^[a-f0-9]{64}$/.test(approvedEngineDigest || '')) throw new CutlineError('SNAPSHOT_REQUIRED', 'A prepared, verified snapshot is required.', 503);
  return {
    async restore({ signal, timeoutMs }) {
      const sandbox = await sdk.restoreSnapshot({ snapshotId, timeoutMs, network: 'deny-all', signal });
      return {
        stop: () => sandbox.stop(),
        async render(files, signal) {
          signal.throwIfAborted();
          // Verification is performed by the trusted SDK wrapper, not user input.
          await sandbox.verifyEngine(files.find(f => f.rel === 'engine.js').content, approvedEngineDigest);
          await sandbox.writeFiles(files.map(f => ({ path: `composition/${f.rel}`, content: f.content })), { signal });
          signal.throwIfAborted();
          const check = await sandbox.runCommand({ cmd: 'node_modules/.bin/hyperframes', args: ['check', 'composition', '--json'], signal });
          if (check.exitCode !== 0) throw new CutlineError('COMPOSITION_CHECK_FAILED', 'Composition validation failed.');
          const result = await sandbox.runCommand({ cmd: 'node_modules/.bin/hyperframes', args: ['render', 'composition', '-o', 'out.mp4', '--workers', '1'], signal });
          if (result.exitCode !== 0) throw new CutlineError('RENDER_FAILED', 'Rendering failed.');
          signal.throwIfAborted();
          return sandbox.readFileToBuffer({ path: 'out.mp4', signal });
        },
      };
    },
  };
}
