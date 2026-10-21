import { beginGmailOAuth } from '@/lib/server/gmail-oauth';
import { openMailStore } from '@/lib/server/mail-queue-store';
import { beginComposioGmail, preferredGmailProvider } from '@/lib/server/composio-gmail';
export async function POST(req: Request) {
  let store;
  try {
    const body = await req.json().catch(() => ({}));
    const provider = body.provider || preferredGmailProvider();
    if (!['google', 'composio'].includes(provider)) throw Error('Choose a supported Gmail provider.');
    store = openMailStore(); const result = provider === 'composio' ? await beginComposioGmail(store) : beginGmailOAuth(store);
    return Response.json({ url: result.url }, { headers: { 'Set-Cookie': `hermes_gmail_state=${result.browser}; HttpOnly; SameSite=Lax; Path=/api/gmail; Max-Age=600${result.secure ? '; Secure' : ''}`, 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  finally { store?.close(); }
}
