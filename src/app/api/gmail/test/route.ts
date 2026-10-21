import { handle } from '@/lib/server/http';
import { openMailStore } from '@/lib/server/mail-queue-store';
import { sendGmailSelfTest } from '@/lib/server/gmail-sender';
export async function POST() { return handle(async () => { const store = openMailStore(); try { return await sendGmailSelfTest(store); } finally { store.close(); } }); }
