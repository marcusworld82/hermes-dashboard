import { handle } from '@/lib/server/http';
import { refreshLeadResearch } from '@/lib/server/lead-research';
export function POST(req: Request) {
  return handle(async () => {
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw Error('Send JSON.');
    await req.json();
    return refreshLeadResearch(true);
  });
}
