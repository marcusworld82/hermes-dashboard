import { cutlineCloudOwner } from '@/lib/server/cutline-cloud-http.mjs';
import { loadCutlineTrustedAssets } from '@/lib/server/cutline-cloud-assets.mjs';
export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  try {
    cutlineCloudOwner(request, process.env);
    const name = (await context.params).name;
    if (!/^[a-zA-Z0-9_-]+\.woff2$/.test(name) && !['whoosh.mp3', 'whoosh-heavy.mp3', 'click.wav'].includes(name)) return new Response('Not found.', { status: 404 });
    const assets = await loadCutlineTrustedAssets();
    const font = assets.fonts.find(f => f.file === name);
    const content = font?.content || assets.audio[name]; if (!content) return new Response('Not found.', { status: 404 });
    return new Response(new Uint8Array(content), { headers: { 'Content-Type': font ? 'font/woff2' : name.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return Response.json({ error: 'Trusted preview sound is unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } }); }
}
