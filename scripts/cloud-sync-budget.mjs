// 48 scheduled snapshots per day, at most 1,488 over 31 days. Keep room
// within Hobby's 2,000 Advanced Operations for tunnel registrations.
export const SNAPSHOT_INTERVAL_MS = 30 * 60_000;
const FAILURE_RETRY_MS = SNAPSHOT_INTERVAL_MS;
export function createSyncBudget({now = Date.now, lastSyncedAt} = {}) {
 const saved = Date.parse(lastSyncedAt || '');
 let nextUpload = Number.isFinite(saved) ? saved + SNAPSHOT_INTERVAL_MS : 0;
 let nextRegistration = 0;
 return {
  canUpload: () => now() >= nextUpload,
  uploaded: () => { nextUpload = now() + SNAPSHOT_INTERVAL_MS; },
  uploadFailed: () => { nextUpload = now() + FAILURE_RETRY_MS; },
  canRegister: () => now() >= nextRegistration,
  registrationFailed: () => { nextRegistration = now() + FAILURE_RETRY_MS; },
  registrationSucceeded: () => { nextRegistration = 0; },
 };
}
