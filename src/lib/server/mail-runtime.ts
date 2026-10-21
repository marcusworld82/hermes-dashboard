import { isPersistentMailHost, persistentMailHostBlock } from './persistent-mail-host.ts';
import { createDirectNotionMailAdapter, directNotionConfig } from './notion-mail-direct.ts';
function direct() { const block = persistentMailHostBlock(); if (block) throw Error(block); return createDirectNotionMailAdapter(directNotionConfig()); }
export async function getRuntimeLeadEmailSnapshot(id: string, kind: 'first' | 'followup' = 'first') {
  if (isPersistentMailHost()) return direct().email(id, kind);
  return (await import('./lead-actions.ts')).getLeadEmailSnapshot(id, kind);
}
export async function getRuntimeFreshLeadSnapshot(id: string) {
  if (isPersistentMailHost()) return direct().snapshot(id);
  return (await import('./lead-actions.ts')).getFreshLeadSnapshot(id);
}
export async function updateRuntimeDeliveryStage(id: string, expectedRevision: string, change: { stage: string }, internal?: { deliveryEvent: 'bounce' }) {
  if (isPersistentMailHost()) return direct().updateStage(id, expectedRevision, change.stage, internal?.deliveryEvent === 'bounce');
  return (await import('./lead-actions.ts')).updateLead(id, expectedRevision, change, internal);
}
