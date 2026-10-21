import { handle } from '@/lib/server/http';
import { openMailStore } from '@/lib/server/mail-queue-store';
import { verifyGmailSelfTest } from '@/lib/server/gmail-sender';
export async function POST() { return handle(async () => { const store = openMailStore(); try { return await verifyGmailSelfTest(store); } finally { store.close(); } }); }
