import { handle } from '@/lib/server/http';
import { openMailStore } from '@/lib/server/mail-queue-store';
import { pollGmailInbox } from '@/lib/server/gmail-inbox';
export async function POST() { return handle(async () => { const store = openMailStore(); try { return await pollGmailInbox(store); } finally { store.close(); } }); }
