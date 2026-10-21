import { isPersistentMailHost } from './persistent-mail-host.ts';
import { openMailStore, type MailItem } from './mail-queue-store.ts';
import { openMorningStore } from './morning-store.ts';
import { getRuntimeFreshLeadSnapshot as getFreshLeadSnapshot, updateRuntimeDeliveryStage as updateLead } from './mail-runtime.ts';

type EventType = 'sent' | 'replied' | 'bounced' | 'not-interested';
type EventReceipt = { at: number; status: 'applied' | 'review' | 'error'; detail: string };
export function emailEventStage(type: EventType, currentStage: string, currentRevision: string, item: Pick<MailItem, 'revision'>, ownSentApplied: boolean) {
  if (['Denied', 'Do not contact', 'Meeting', 'Client', 'Paused'].includes(currentStage)) return null;
  if (type === 'sent') return currentRevision === item.revision && ['New', 'Ready to send', ''].includes(currentStage) ? 'Sent' : null;
  if (currentRevision !== item.revision && !(currentStage === 'Sent' && ownSentApplied)) return null;
  return type === 'not-interested' ? 'Do not contact' : type === 'bounced' ? 'Paused' : 'Replied';
}
export async function syncEmailDeliveryEvents() {
  const mail = openMailStore(), log = openMorningStore();
  try {
    const state = mail.read(), receipts = log.get<Record<string, EventReceipt>>('mail-events', {}), now = Date.now();
    const results: { id: string; status: string; detail: string }[] = [];
    for (const item of state.items) {
      if (!item.sentAt) continue;
      const sentKey = `${item.id}:sent:${item.sentAt}`;
      const events: { type: EventType; at: number }[] = [{ type: 'sent', at: item.sentAt }];
      if (item.replyAt) events.push({ type: state.suppressed[item.email] === 'Not interested' ? 'not-interested' : 'replied', at: item.replyAt });
      if (item.bouncedAt) events.push({ type: 'bounced', at: item.bouncedAt });
      for (const event of events) {
        const id = `${item.id}:${event.type}:${event.at}`, previous = receipts[id];
        if (previous && (previous.status !== 'error' || now - previous.at < 5 * 60000)) continue;
        if (results.length >= 3) break;
        let receipt: EventReceipt;
        try {
          const fresh = await getFreshLeadSnapshot(item.leadId);
          const stage = emailEventStage(event.type, fresh.stage, fresh.revision, item, receipts[sentKey]?.status === 'applied');
          if (!stage || fresh.email.trim().toLowerCase() !== item.email) receipt = { at: now, status: 'review', detail: `Email ${event.type} is recorded. Notion changed or has a protected stage; no automatic overwrite.` };
          else {
            await updateLead(item.leadId, fresh.revision, { stage }, event.type === 'bounced' ? { deliveryEvent: 'bounce' } : undefined);
            receipt = { at: now, status: 'applied', detail: `Notion stage updated to ${stage}.` };
          }
        } catch { receipt = { at: now, status: 'error', detail: isPersistentMailHost() && process.env.HERMES_NOTION_STAGE_WRITES_APPROVED !== 'true' ? 'Host Notion stage writes await deployment review. Delivery evidence and suppression are preserved.' : 'Notion event update was not confirmed. Queue evidence and suppression are preserved.' }; }
        receipts[id] = receipt; log.set('mail-events', receipts); results.push({ id, ...receipt });
      }
      if (results.length >= 3) break;
    }
    return { results };
  } finally { mail.close(); log.close(); }
}
