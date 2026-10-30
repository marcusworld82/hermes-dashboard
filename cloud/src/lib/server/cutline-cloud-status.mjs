export function cutlineCloudConfig(env = process.env) {
  const positive = name => { const n = Number(env[name]); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
  return {
    spending: env.CUTLINE_CLOUD_SPEND_ENABLED === 'true', storage: env.CUTLINE_CLOUD_STORAGE_ENABLED === 'true',
    dispatch: env.CUTLINE_CLOUD_DISPATCH_ENABLED === 'true', assetsReady: env.CUTLINE_CLOUD_ASSETS_READY === 'true',
    snapshotId: /^[a-zA-Z0-9_-]{1,128}$/.test(env.CUTLINE_CLOUD_SNAPSHOT_ID || '') ? env.CUTLINE_CLOUD_SNAPSHOT_ID : '',
    storageCredentials: !!env.BLOB_READ_WRITE_TOKEN || (!!env.BLOB_STORE_ID && !!env.VERCEL_OIDC_TOKEN),
    perJobCents: positive('CUTLINE_CLOUD_PER_JOB_CENTS'), dailyCents: positive('CUTLINE_CLOUD_DAILY_CENTS'),
    concurrency: positive('CUTLINE_CLOUD_CONCURRENCY') || 1,
  };
}
export function cutlineCloudStatus(env = process.env) {
  const c = cutlineCloudConfig(env); const blockers = []; const blockerDetails = [];
  const add = (code, message) => { blockers.push(message); blockerDetails.push({ code, message }); };
  if (!c.spending) add('SPENDING_DISABLED', 'Cloud rendering spending is disabled by the owner.');
  if (!c.storage || !c.storageCredentials) add('PRIVATE_STORAGE_REQUIRED', 'Restore existing private Blob capacity and configure CUTLINE_CLOUD_STORAGE_ENABLED with server credentials. No storage health check has run.');
  if (!c.snapshotId) add('SNAPSHOT_REQUIRED', 'Configure a prepared and verified CUTLINE_CLOUD_SNAPSHOT_ID. No fresh Sandbox fallback is allowed.');
  if (!c.assetsReady) add('ASSETS_REQUIRED', 'Install the licensed font, GSAP and SFX bundle with verified digests, then set CUTLINE_CLOUD_ASSETS_READY=true.');
  if (!c.perJobCents || c.dailyCents < c.perJobCents || c.concurrency > 3) add('BUDGET_REQUIRED', 'Approve positive integer per-job/daily cents and concurrency between one and three.');
  if (!c.dispatch) add('DISPATCH_DISABLED', 'Enable CUTLINE_CLOUD_DISPATCH_ENABLED only after the owner reviews worker setup.');
  const available = blockers.length === 0;
  return {
    available, provider: 'vercel-sandbox', mode: available ? 'configured' : 'blocked', code: available ? 'CONFIGURED_NOT_VERIFIED' : 'OWNER_CONFIGURATION_REQUIRED',
    message: available ? 'Cloud render configuration is present. Assets and storage are validated when used; live fidelity has not been verified.' : 'Cloud rendering is inactive. The Mac Cutline service remains available when connected.',
    canRender: available, canUpload: false, automaticRetry: false, blockers, blockerDetails, storageHealth: 'not_checked', assetHealth: 'not_checked', liveFidelity: 'unverified',
    features: {
      editorShell: 'bundled', wordEdits: 'mac-runtime', spotlight: 'mac-runtime', speakers: 'mac-runtime', keyframes: 'mac-runtime',
      motion: 'mac-runtime', transitions: 'mac-runtime', sfx: 'mac-runtime', savedStyles: 'mac-runtime', savedLayouts: 'mac-runtime',
      faceDetection: 'mac-only-apple-vision', translation: 'mac-only-claude-cli', watchFolder: 'mac-only', srt: 'mac-runtime', mp4: available ? 'configured-unverified' : 'blocked-cloud', cli: 'mac-only',
    },
  };
}
