import { handle } from '@/lib/server/http';
import { readRewriteHistory, rewriteLead } from '@/lib/server/lead-rewrite';
import { splitLeadId } from '@/lib/server/lead-actions';
export function GET(_req: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => { const { id } = await context.params; splitLeadId(id); return { versions: readRewriteHistory(id) }; }); }
export function POST(req: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => {
  if (process.env.HERMES_DEPLOYMENT_MODE === 'persistent-host') throw Error('Edit this lead in Notion or on your Mac. Hosted draft editing is unavailable.');
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw Error('Send JSON.');
  const { id } = await context.params;
  const input = await req.json();
  if (typeof input.revision !== 'string' || typeof input.instruction !== 'string' || !['email', 'dm', 'callScript', 'followup'].includes(input.type)) throw Error('Choose a draft and describe the rewrite.');
  return rewriteLead(id, input.revision, input.type, input.instruction);
}); }
