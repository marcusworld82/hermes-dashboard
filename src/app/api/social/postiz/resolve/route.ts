import { handle, body } from "@/lib/server/http";
import { resolveRecord } from "@/lib/server/social-posts";

// After checking Postiz by hand, Marcus marks an unconfirmed post as posted or not posted.
export async function POST(req: Request) {
  const b = await body<{ id?: string; state?: string }>(req);
  return handle(() => {
    if (!b.id || (b.state !== "scheduled" && b.state !== "failed")) throw new Error("Pick posted or not posted.");
    resolveRecord(b.id, b.state);
    return { ok: true };
  });
}
