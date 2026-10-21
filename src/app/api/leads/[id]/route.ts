import { handle } from '@/lib/server/http';
import { updateLead } from '@/lib/server/lead-actions';
export function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (process.env.HERMES_DEPLOYMENT_MODE === 'persistent-host') throw Error('Edit this lead in Notion or on your Mac. Hosted draft editing is unavailable.');
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw Error('Send JSON.');
    const { id } = await context.params;
    const payload = await req.json();
    if (typeof payload.revision !== 'string') throw Error('Refresh the lead before changing it.');
    return updateLead(id, payload.revision, { stage: payload.stage, pauseUntil: payload.pauseUntil, denialReason: payload.denialReason, draftType: payload.draftType, draft: payload.draft });
  });
}
