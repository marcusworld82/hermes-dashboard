import { handle } from "@/lib/server/http";
import { postizClient, postizReady } from "@/lib/server/postiz";
import { listPostRecords } from "@/lib/server/social-posts";

// Hermes post records plus what Postiz reports for the window (defaults to this month and next).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const now = new Date();
  const start = url.searchParams.get("start") || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = url.searchParams.get("end") || new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();
  return handle(async () => {
    let posts: Awaited<ReturnType<ReturnType<typeof postizClient>["posts"]>> = [];
    let error: string | null = null;
    if (postizReady()) {
      try { posts = await postizClient().posts(start, end); } catch (e) { error = (e as Error).message; }
    }
    return { ready: postizReady(), posts, records: listPostRecords(), error };
  });
}
