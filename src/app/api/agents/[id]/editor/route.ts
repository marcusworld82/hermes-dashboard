import { handle } from '@/lib/server/http';
import { runAgentEditor } from '@/lib/server/agent-editor';
export function GET(_req: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => runAgentEditor((await context.params).id, { action: 'read' })); }
export function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw Error('Send JSON.');
    const input = await req.json();
    if (!['preview', 'save', 'revert'].includes(input.action)) throw Error('Choose preview, save, or revert.');
    return runAgentEditor((await context.params).id, { action: input.action, state: input.state, revision: input.revision, previewHash: input.previewHash, auditId: input.auditId });
  });
}
