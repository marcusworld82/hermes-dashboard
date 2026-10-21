import { body, handle } from '@/lib/server/http';
import { openMailStore } from '@/lib/server/mail-queue-store';
import { getBusinessSettings } from '@/lib/server/business-settings';
import { getRuntimeLeadEmailSnapshot } from '@/lib/server/mail-runtime';
import { approveBulkEmail, previewBulkEmail } from '@/lib/server/bulk-email';
export async function POST(req: Request) { return handle(async () => {
  const input = await body<Record<string, unknown>>(req);
  if (!input || !['preview', 'approve'].includes(String(input.action))) throw Error('Choose preview or approve.');
  const store = openMailStore();
  try {
    const settings = getBusinessSettings();
    return input.action === 'preview'
      ? await previewBulkEmail(store, getRuntimeLeadEmailSnapshot, settings, input.ids, input.kind)
      : await approveBulkEmail(store, getRuntimeLeadEmailSnapshot, settings, input.items, input.reviewedAll);
  } finally { store.close(); }
}); }
