import { handle, body } from "@/lib/server/http";
import { runWorkflow, resumeWorkflow, approveWorkflowGate } from "@/lib/server/workflows";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const request = await body<{ action?: string; taskId?: string; confirmed?: boolean; result?: string }>(req);
  return handle<unknown>(() => request.action === "gate" ? approveWorkflowGate(id, request.taskId, request.confirmed, request.result) : request.action === "resume" ? resumeWorkflow(id) : runWorkflow(id));
}
