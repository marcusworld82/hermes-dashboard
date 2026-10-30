import { createRenderWorker, CutlineError, LIMITS } from './cutline-cloud-core.mjs';
import { createSnapshotProvider } from './cutline-cloud-provider.mjs';
import { createVercelSandboxSDK, createPrivateBlobOutputs } from './cutline-cloud-vercel.mjs';
import { createCutlineBlobBackend } from './cutline-cloud-store.mjs';
import { createCutlineCompiler } from './cutline-cloud-compiler.mjs';

/** Server-side composition root. Pure configuration creates no Sandbox and performs
 * no Blob operation. Callers supply imported SDK modules, licensed trusted assets
 * and approved budget. HTTP remains fail-closed until the owner enables a worker. */
export function createConfiguredCutlineRuntime({ Sandbox, blob, credentialOptions = {}, snapshotId, approvedBudget, trustedAssets }) {
  const compiler = createCutlineCompiler(trustedAssets);
  const backend = createCutlineBlobBackend({ blob, credentialOptions, approvedBudget });
  const provider = createSnapshotProvider({ sdk: createVercelSandboxSDK({ Sandbox }), snapshotId, approvedEngineDigest: trustedAssets.engineDigest });
  const outputs = createPrivateBlobOutputs({ blob, credentialOptions });
  const projects = {
    authorize: backend.projects.authorize,
    async bundle(owner, projectId, revision) {
      const project = await backend.projects.authorize(owner, projectId, revision);
      const result = await blob.get(project.assetPath, { ...credentialOptions, access: 'private', useCache: false });
      if (!result || result.statusCode !== 200 || result.blob.pathname !== project.assetPath || result.blob.size < 1 || result.blob.size > LIMITS.bundleBytes) throw new CutlineError('SOURCE_UNAVAILABLE', 'Owned source media unavailable.', 503);
      const reader = result.stream.getReader(); const parts = []; let length = 0;
      try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > LIMITS.bundleBytes) { await reader.cancel(); throw new CutlineError('SOURCE_TOO_LARGE', 'Source exceeds limit.'); } parts.push(Buffer.from(value)); } } finally { reader.releaseLock(); }
      return compiler.compile(project.doc, Buffer.concat(parts));
    },
  };
  return { worker: createRenderWorker({ store: backend.store, budget: backend.budget, projects, provider, outputs }), store: backend.store, projects: backend.projects, outputs };
}
