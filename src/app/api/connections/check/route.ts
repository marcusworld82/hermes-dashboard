import { body, handle } from '@/lib/server/http';
import { quoteOpenRouter, runMcpProbe, runOpenRouterCheck } from '@/lib/server/connection-probes';

export async function GET() {
  return handle(() => quoteOpenRouter());
}
export async function POST(req: Request) {
  return handle(async () => {
    const input = await body<{ id?: string; approvedCost?: number }>(req);
    return input.id === 'openrouter' ? runOpenRouterCheck(input.approvedCost) : runMcpProbe(String(input.id || ''));
  });
}
