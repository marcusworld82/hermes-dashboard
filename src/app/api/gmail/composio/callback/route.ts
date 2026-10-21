import { finishComposioGmail, composioGmailConfig } from '@/lib/server/composio-gmail';
import { openMailStore } from '@/lib/server/mail-queue-store';

const headers = { 'Set-Cookie': 'hermes_gmail_state=; HttpOnly; SameSite=Lax; Path=/api/gmail; Max-Age=0', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
export async function GET(req: Request) {
  let store;
  try {
    const url = new URL(req.url);
    const browser = req.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('hermes_gmail_state='))?.slice('hermes_gmail_state='.length) || '';
    store = openMailStore();
    // Callback account IDs and success flags never select the mailbox.
    await finishComposioGmail(store, url.searchParams.get('state') || '', browser);
    return new Response(null, { status: 303, headers: { ...headers, Location: new URL('/settings/gmail?connected=1', composioGmailConfig().callbackUrl).href } });
  } catch { return new Response('Gmail sign-in did not complete. Return to Settings > Gmail and connect again.', { status: 400, headers }); }
  finally { store?.close(); }
}
