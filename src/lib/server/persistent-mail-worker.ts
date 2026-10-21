import { persistentMailHostBlock } from './persistent-mail-host.ts';
import { directNotionConfig } from './notion-mail-direct.ts';
import { runApprovedSender, runAutomationSteps } from './morning-worker.ts';
import { syncEmailDeliveryEvents } from './morning-mail-events.ts';
import { openMorningStore } from './morning-store.ts';

export function persistentWorkerPreflight(env = process.env) {
  const block = persistentMailHostBlock(env); if (block) throw Error(block);
  directNotionConfig(env);
}
export async function runPersistentMailTick() {
  persistentWorkerPreflight();
  const result = await runAutomationSteps({ sender: runApprovedSender, 'notion-mail-events': syncEmailDeliveryEvents });
  const store = openMorningStore();
  try { store.set('worker', { ...result, runtime: 'persistent-host' }); } finally { store.close(); }
  return result;
}
