import { handle } from '@/lib/server/http';
import { refreshLeadResearch } from '@/lib/server/lead-research';
export function GET() { return handle(() => refreshLeadResearch()); }
