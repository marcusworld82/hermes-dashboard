import { handle } from "@/lib/server/http";
import { runWorkflow } from "@/lib/server/workflows";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => runWorkflow(id));
}
