import type { NextRequest } from "next/server";
import { handle, body } from "@/lib/server/http";
import * as hermes from "@/lib/server/hermes";
import { paths } from "@/lib/server/paths";
import { getSettings } from "@/lib/server/settings";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const board = req.nextUrl.searchParams.get("board") || paths.board;
  return handle(() => hermes.showTask(id, board));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const board = req.nextUrl.searchParams.get("board") || paths.board;
  const b = await body<{ action?: string; text?: string; profile?: string }>(req);
  return handle(async () => {
    switch (b.action) {
      case "comment":
        if (!b.text?.trim()) throw new Error("Type a comment first.");
        await hermes.comment(id, b.text.trim(), "marcus", board);
        break;
      case "block":
        await hermes.blockTask(id, b.text?.trim() || "Paused by Marcus", board);
        break;
      case "unblock": {
        // Unblocking an assigned card lets its agent start, which costs money.
        const t = await hermes.showTask(id, board);
        if (t.task.assignee && !getSettings().agentRuns) throw new Error("Agent runs are off. Turn them on in Settings before releasing an assigned card.");
        await hermes.unblockTask(id, board);
        break;
      }
      case "archive":
        await hermes.archiveTask(id, board);
        break;
      default:
        throw new Error("Unknown action.");
    }
    return hermes.showTask(id, board);
  });
}
