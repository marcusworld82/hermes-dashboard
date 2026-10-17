import { handle, body } from "@/lib/server/http";
import { deleteThread, getThread, send } from "@/lib/server/chat";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => getThread(id));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { text } = await body<{ text?: string }>(req);
  return handle(() => send(id, String(text ?? "")));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => {
    deleteThread(id);
    return { ok: true };
  });
}
