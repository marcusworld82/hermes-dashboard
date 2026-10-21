import type { NextRequest } from "next/server";
import { handle, body } from "@/lib/server/http";
import { listBoards, listTasks } from "@/lib/server/hermes";
import { paths } from "@/lib/server/paths";

export async function GET(req: NextRequest) {
  const board = req.nextUrl.searchParams.get("board") || paths.board;
  return handle(async () => {
    const [boards, tasks] = await Promise.all([listBoards(), listTasks(board)]);
    return { board, boards, tasks };
  });
}

export async function POST(req: NextRequest) {
  const b = await body<{ title?: string; instructions?: string; assignee?: string; board?: string }>(req);
  return handle(async () => {
    const title = String(b.title ?? "").trim();
    if (!title || title.length > 120) throw new Error("Use a task title from 1 to 120 characters.");
    const board = b.board || paths.board;
    if (!/^[a-z0-9_-]{1,80}$/.test(board)) throw new Error("Choose a valid board.");
    const { getAgents } = await import("@/lib/server/agents");
    if (b.assignee && !(await getAgents()).some((a) => a.id === b.assignee && a.installed)) throw new Error("Choose an installed agent.");
    const { createTask, ensureBoard } = await import("@/lib/server/hermes");
    if (board === paths.board) await ensureBoard(board);
    // Create paused so Marcus can inspect the card before releasing it.
    return createTask({ title, body: String(b.instructions ?? "").slice(0, 8000), assignee: b.assignee || undefined, board, blocked: true });
  }, 201);
}
