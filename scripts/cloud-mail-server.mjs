#!/usr/bin/env node
// Review-only deployment entry. Starting it can release explicitly approved mail
// only after the separate sender switch, consent and verified self-test gates pass.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const { persistentWorkerPreflight, runPersistentMailTick } = await import('../src/lib/server/persistent-mail-worker.ts');
try { persistentWorkerPreflight(); } catch (error) { console.error(error.message); process.exit(1); }
if (process.argv.includes('--check')) {
  console.log('Persistent mail configuration passed static checks. No API request or delivery was attempted.');
  process.exit(0);
}
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
// One awaited loop prevents overlap. SQLite queue claims also protect concurrent
// manual release requests. Service manager must run exactly one worker instance.
do {
  try { const result = await runPersistentMailTick(); console.log(JSON.stringify({ event: 'mail-worker-tick', checkedAt: result.checkedAt, steps: result.results.map(({ name, ok }) => ({ name, ok })) })); }
  catch { console.error('Mail worker tick failed. Existing approvals and delivery evidence are preserved.'); }
  if (process.argv.includes('--once')) break;
  for (let i = 0; i < 60 && !stopping; i++) await new Promise(resolve => setTimeout(resolve, 1000));
} while (!stopping);
