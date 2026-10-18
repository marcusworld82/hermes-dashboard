import { handle, body } from "@/lib/server/http";
import { postizClient } from "@/lib/server/postiz";

export async function POST(req: Request) {
  const b = await body<{ postId?: string }>(req);
  return handle(async () => {
    if (!b.postId) throw new Error("Missing post.");
    await postizClient().cancel(b.postId);
    return { ok: true };
  });
}
