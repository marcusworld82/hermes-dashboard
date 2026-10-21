import { handle } from '@/lib/server/http';
import { openMailStore } from '@/lib/server/mail-queue-store';
import { getBusinessSettings } from '@/lib/server/business-settings';
import { getRuntimeLeadEmailSnapshot as getLeadEmailSnapshot } from '@/lib/server/mail-runtime';
import { legacyAutomation, senderConsentHash } from '@/lib/server/morning-run';
import { releaseGmailQueue } from '@/lib/server/gmail-sender';
// Explicit dashboard click only. No GET send route and no hidden timer.
export async function POST() { return handle(async () => {
  const store = openMailStore();
  const approvedSettings = getBusinessSettings();
  try { return await releaseGmailQueue(store, approvedSettings, getLeadEmailSnapshot, fetch, () => { if (senderConsentHash(getBusinessSettings()) !== senderConsentHash(approvedSettings)) return 'Sender limits or identity changed during release. Review and retry.'; const old = legacyAutomation(); return old.error || (old.sender ? 'Turn off the old CRM sender before releasing Gmail emails.' : null); }); }
  finally { store.close(); }
}); }
