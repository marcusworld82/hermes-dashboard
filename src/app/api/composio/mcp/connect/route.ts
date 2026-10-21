import { beginComposioMcpLogin, composioMcpCallbackUrl } from '@/lib/server/composio-mcp';
export async function POST(req: Request) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin || origin !== composioMcpCallbackUrl().origin) return Response.json({ error: `Open ${composioMcpCallbackUrl().origin}/settings/gmail to sign in to Composio.` }, { status: 403, headers });
  try {
    const login = await beginComposioMcpLogin();
    return Response.json({ url: login.url }, { headers: { ...headers, 'Set-Cookie': `hermes_composio_mcp=${login.browser}; HttpOnly; SameSite=Lax; Path=/api/composio/mcp; Max-Age=600${login.secure ? '; Secure' : ''}` } });
  } catch { return Response.json({ error: 'Composio sign-in could not start. Try again.' }, { status: 502, headers }); }
}
