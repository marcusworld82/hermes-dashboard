import { discoveryStatus, quoteDiscovery, resumeDiscovery, startDiscovery, syncDiscovery } from '@/lib/server/discovery';
import { handle } from '@/lib/server/http';
export async function GET() { return handle(discoveryStatus); }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === 'quote') return Response.json(await quoteDiscovery(body.kind));
    if (body.action === 'start') return Response.json(startDiscovery(body.id,body.approvedCapUsd));
    if (body.action === 'resume') return Response.json(resumeDiscovery(body.id));
    if (body.action === 'sync') return Response.json(await syncDiscovery(body.id));
    return Response.json({error:'Unknown discovery action.'},{status:400});
  } catch (error) { return Response.json({error: error instanceof Error ? error.message : 'Discovery failed.'},{status:400}); }
}
