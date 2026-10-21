import { openMorningStore, type createMorningStore } from './morning-store.ts';
import { openMailStore, mailStorageBlock } from './mail-queue-store.ts';
type TelegramApproval = { enabled: boolean; destination: string; at: number };
type NoticeReceipt = { claimedAt: number; status: 'sending' | 'sent' | 'unknown' };
function destination() { return process.env.GMAIL_ALERT_TELEGRAM_CHAT_ID || ''; }
export function telegramAlertStatus(store: ReturnType<typeof createMorningStore>) {
  const configured = !!process.env.TELEGRAM_BOT_TOKEN && /^-?\d{5,30}$/.test(destination());
  const approval = store.get<TelegramApproval | null>('telegram-approval', null);
  return { configured, destination: configured ? destination() : null, enabled: !!(configured && approval?.enabled && approval.destination === destination()) };
}
export function approveTelegramAlerts(enabled: boolean, approvedDestination?: string) {
  const block = mailStorageBlock(); if (block) throw Error(block);
  const store = openMorningStore();
  try {
    const status = telegramAlertStatus(store);
    if (enabled && (!status.configured || approvedDestination !== status.destination)) throw Error('Configure the Telegram bot and destination, then approve that exact chat.');
    store.set('telegram-approval', { enabled, destination: status.destination || '', at: Date.now() });
    return telegramAlertStatus(store);
  } finally { store.close(); }
}
export async function sendApprovedMailAlerts(fetcher: typeof fetch = fetch) {
  const log = openMorningStore(); let mail;
  try {
    const status = telegramAlertStatus(log); if (!status.enabled) return { skipped: 'Telegram queue alerts are off.' };
    mail = openMailStore();
    const receipts = log.get<Record<string, NoticeReceipt>>('telegram-receipts', {}), results: { id: string; status: string }[] = [];
    for (const notice of mail.read().notices.filter(row => !receipts[row.id]).slice(0, 5)) {
      if (!telegramAlertStatus(log).enabled || !log.claimOnce(`telegram:${notice.id}`)) continue;
      // Durable claim first. An uncertain network result never triggers a duplicate alert.
      receipts[notice.id] = { claimedAt: Date.now(), status: 'sending' }; log.set('telegram-receipts', receipts);
      try {
        if (!telegramAlertStatus(log).enabled) break;
        const response = await fetcher(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: status.destination, text: `Marcus OS email queue: ${notice.text}\nReview Outbox on your dashboard.`, disable_web_page_preview: true }), signal: AbortSignal.timeout(10000) });
        const result = await response.json();
        receipts[notice.id].status = response.ok && result.ok === true ? 'sent' : 'unknown';
      } catch { receipts[notice.id].status = 'unknown'; }
      log.set('telegram-receipts', receipts); results.push({ id: notice.id, status: receipts[notice.id].status });
    }
    return { results };
  } finally { mail?.close(); log.close(); }
}
