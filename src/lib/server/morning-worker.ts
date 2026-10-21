import { getBusinessSettings } from './business-settings.ts';
import { runMorning, legacyAutomation, senderConsentHash } from './morning-run.ts';
import { openMorningStore, type AutomationConsent } from './morning-store.ts';
import { mailStorageBlock, openMailStore } from './mail-queue-store.ts';
import { getRuntimeLeadEmailSnapshot as getLeadEmailSnapshot } from './mail-runtime.ts';
import { releaseGmailQueue } from './gmail-sender.ts';
import { sendApprovedMailAlerts } from './morning-telegram.ts';
import { syncEmailDeliveryEvents } from './morning-mail-events.ts';

export function senderAutomationBlock() {
  const cloud = mailStorageBlock(); if (cloud) return cloud;
  const settings = getBusinessSettings();
  if (!settings.senderEnabled) return 'Automatic email release is off.';
  const legacy = legacyAutomation(); if (legacy.sender || legacy.error) return legacy.error || 'Legacy CRM sending is still enabled. Gmail worker is blocked.';
  const store = openMorningStore();
  try {
    const consent = store.get<AutomationConsent | null>('consent', null);
    if (!consent?.senderHash || consent.senderHash !== senderConsentHash(settings)) return 'Sender limits or identity changed. Review and activate automatic release again.';
    return null;
  } finally { store.close(); }
}
export async function runApprovedSender() {
  const block = senderAutomationBlock(); if (block) return { skipped: block };
  const store = openMailStore();
  try {
    const state = store.read();
    if (!state.account || !state.test?.verifiedAt || state.test.account !== state.account.email) return { skipped: 'Gmail connection and verified self-test are required.' };
    return await releaseGmailQueue(store, getBusinessSettings(), getLeadEmailSnapshot, fetch, senderAutomationBlock);
  } finally { store.close(); }
}
export async function runAutomationSteps(steps: Record<string, () => Promise<unknown>>) {
  const results: { name: string; ok: boolean; detail?: string; result?: unknown }[] = [];
  for (const [name, run] of Object.entries(steps)) {
    try { results.push({ name, ok: true, result: await run() }); }
    catch { results.push({ name, ok: false, detail: `${name} failed. Check its saved status. Other steps still run.` }); }
  }
  return { checkedAt: new Date().toISOString(), results };
}
export async function runLocalAutomationTick() {
  const blocked = mailStorageBlock(); if (blocked) return { blocked };
  const result = await runAutomationSteps({ morning: () => runMorning(), sender: runApprovedSender, 'notion-mail-events': syncEmailDeliveryEvents, 'telegram-alerts': sendApprovedMailAlerts });
  const store = openMorningStore(); try { store.set('worker', result); } finally { store.close(); }
  return result;
}
