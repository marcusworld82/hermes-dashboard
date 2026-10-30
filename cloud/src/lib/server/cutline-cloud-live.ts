import {privateStorage} from './private-storage';
import { createCutlineHTTP } from './cutline-cloud-http.mjs';
import { createConfiguredCutlineRuntime } from './cutline-cloud-runtime.mjs';
import { createCutlineCompiler } from './cutline-cloud-compiler.mjs';
import { cutlineCloudConfig, cutlineCloudStatus } from './cutline-cloud-status.mjs';
import { createCutlineBlobBackend } from './cutline-cloud-store.mjs';
import { createPrivateBlobOutputs } from './cutline-cloud-vercel.mjs';
import { loadCutlineTrustedAssets } from './cutline-cloud-assets.mjs';
// Imports are deferred until all explicit configuration gates pass. Construction
// does not provision infrastructure; only explicit dispatch can call Sandbox.
export const cutlineCloudHTTP = createCutlineHTTP({
  async status() {
    const status = cutlineCloudStatus();
    if (cutlineCloudConfig().assetsReady) {
      try { createCutlineCompiler(await loadCutlineTrustedAssets()); status.assetHealth = 'verified'; }
      catch {
        status.available = false; status.canRender = false; status.mode = 'blocked'; status.assetHealth = 'unavailable'; status.code = 'OWNER_CONFIGURATION_REQUIRED';
        status.blockers.push('The trusted asset manifest, digests or licensed font bundle could not be verified.');
        status.blockerDetails.push({ code: 'ASSETS_INVALID', message: 'Verify the server-owned cutline-runtime-assets bundle and preview engine digest.' });
      }
    }
    return status;
  },
  async loadRuntime(action: string) {
    if (['job', 'output'].includes(action)) {
      const blob = privateStorage();
      return { store: createCutlineBlobBackend({ blob, approvedBudget: undefined }).store, outputs: createPrivateBlobOutputs({ blob }) };
    }
    const [sdk, blob, trustedAssets] = await Promise.all([
      import('@vercel/sandbox'), Promise.resolve(privateStorage()), loadCutlineTrustedAssets(),
    ]);
    const c = cutlineCloudConfig();
    return createConfiguredCutlineRuntime({
      Sandbox: sdk.Sandbox, blob, snapshotId: c.snapshotId,
      approvedBudget: { perJobCents: c.perJobCents, dailyCents: c.dailyCents, concurrency: c.concurrency }, trustedAssets,
    });
  },
});
