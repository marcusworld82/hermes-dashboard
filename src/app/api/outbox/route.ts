import { body, handle } from '@/lib/server/http';
import { openMailStore, mailStorageBlock } from '@/lib/server/mail-queue-store';
import { approveEmail, setQueuePaused } from '@/lib/server/mail-queue';
import { getBusinessSettings } from '@/lib/server/business-settings';
import { getRuntimeLeadEmailSnapshot as getLeadEmailSnapshot } from '@/lib/server/mail-runtime';
export async function GET() { return handle(() => {
  const block = mailStorageBlock(); if (block) return { blocked: block, items: [], notices: [], paused: true };
  const store = openMailStore();
  try { const state = store.read(); return { blocked: null, senderEnabled: getBusinessSettings().senderEnabled, items: [...state.items].reverse(), notices: state.notices.slice(-20).reverse(), paused: state.paused, pauseReason: state.pauseReason, nextReleaseAt: state.nextReleaseAt, account: state.account?.email || null }; }
  finally { store.close(); }
}); }
export async function POST(req: Request) { return handle(async () => {
  const input = await body<{ id?: string; approvedHash?: string; kind?: string; action?: string }>(req);
  const store = openMailStore();
  try {
    if (input.action === 'pause' || input.action === 'resume') { setQueuePaused(store, input.action === 'pause'); return { ok: true }; }
    if (input.action === 'cancel') {
      store.transaction(state => { const item = state.items.find(row => row.id === input.id); if (!item || !['queued', 'paused'].includes(item.status)) throw Error('Only a waiting email can be cancelled.'); item.status = 'cancelled'; item.error = 'Cancelled by Marcus.'; });
      return { ok: true };
    }
    if (!input.id || typeof input.approvedHash !== 'string' || !['first', 'followup'].includes(input.kind || 'first')) throw Error('Review and approve one exact draft.');
    const kind = input.kind === 'followup' ? 'followup' : 'first';
    const lead = await getLeadEmailSnapshot(input.id, kind);
    return approveEmail(store, lead, getBusinessSettings(), input.approvedHash, kind);
  } finally { store.close(); }
}); }
