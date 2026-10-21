import { finishGmailOAuth } from '@/lib/server/gmail-oauth';
import { openMailStore } from '@/lib/server/mail-queue-store';
import { gmailConfig } from '@/lib/server/gmail-api';
export async function GET(req: Request) {
  let store;
  try {
    const url = new URL(req.url);
    const cookie = req.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('hermes_gmail_state='))?.slice('hermes_gmail_state='.length) || '';
    store = openMailStore();
    await finishGmailOAuth(store, url.searchParams.get('state') || '', cookie, url.searchParams.get('code') || '');
    return new Response(null, { status: 303, headers: { Location: new URL('/settings/gmail?connected=1', gmailConfig().redirectUri).href, 'Set-Cookie': 'hermes_gmail_state=; HttpOnly; SameSite=Lax; Path=/api/gmail; Max-Age=0', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return new Response('Gmail sign-in did not complete. Return to Settings > Gmail and connect again.', { status: 400, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); }
  finally { store?.close(); }
}
