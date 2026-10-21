import { finishComposioMcpLogin, composioMcpCallbackUrl } from '@/lib/server/composio-mcp';
export async function GET(req: Request) {
  const callback = composioMcpCallbackUrl();
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Set-Cookie': `hermes_composio_mcp=; HttpOnly; SameSite=Lax; Path=/api/composio/mcp; Max-Age=0${callback.protocol === 'https:' ? '; Secure' : ''}` };
  try {
    const url = new URL(req.url);
    const browser = req.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('hermes_composio_mcp='))?.slice('hermes_composio_mcp='.length) || '';
    if (url.origin !== callback.origin || url.searchParams.has('error')) throw Error();
    await finishComposioMcpLogin(url.searchParams.get('code') || '', url.searchParams.get('state') || '', browser);
    return new Response(null, { status: 303, headers: { ...headers, Location: new URL('/settings/gmail?composio=connected', callback).href } });
  } catch { return new Response(null, { status: 303, headers: { ...headers, Location: new URL('/settings/gmail?composio=error', callback).href } }); }
}
