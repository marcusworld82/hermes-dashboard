import path from 'node:path';

export function isPersistentMailHost(env = process.env) { return env.HERMES_DEPLOYMENT_MODE === 'persistent-host'; }
export function persistentMailHostBlock(env = process.env): string | null {
  if (!isPersistentMailHost(env)) return 'Persistent-host deployment mode has not been enabled.';
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.NETLIFY || env.K_SERVICE) return 'Persistent SQLite mail hosting cannot run in a serverless or ephemeral container runtime.';
  const dir = env.HERMES_DATA_DIR || '';
  if (!path.isAbsolute(dir) || /^\/(?:tmp|var\/tmp|run|dev|proc|sys)(?:\/|$)/.test(path.normalize(dir))) return 'Set HERMES_DATA_DIR to the reviewed persistent disk directory, outside temporary storage.';
  if (env.HERMES_PERSISTENT_DISK_CONFIRMED !== 'true') return 'Confirm the reviewed persistent disk before enabling this host.';
  return null;
}

export function persistentMailDispatchBlock(env = process.env): string | null {
  return persistentMailHostBlock(env) || (env.HERMES_LEGACY_SENDER_DISABLED === 'true' ? null : 'Confirm the old Mac/CRM sender is disabled before releasing lead emails.') || (env.HERMES_HISTORY_RECONCILED === 'true' ? null : 'Confirm historical delivery and permanent suppression records are reconciled before releasing lead emails.');
}
