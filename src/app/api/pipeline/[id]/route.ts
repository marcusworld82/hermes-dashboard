import { handle, body } from "@/lib/server/http";
import { approve, reject, savePlan, shape, start } from "@/lib/server/pipeline";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await body<{ action?: string; plan?: unknown; reason?: string }>(req);
  return handle(() => {
    switch (b.action) {
      case "shape":
        return shape(id);
      case "plan":
        return savePlan(id, b.plan);
      case "approve":
        return approve(id);
      case "start":
        return start(id);
      case "reject":
        return reject(id, b.reason);
      default:
        throw new Error("Unknown action.");
    }
  });
}
