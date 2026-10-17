import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { listBoards, listTasks } from "@/lib/server/hermes";
import { paths } from "@/lib/server/paths";

export async function GET(req: NextRequest) {
  const board = req.nextUrl.searchParams.get("board") || paths.board;
  return handle(async () => {
    const [boards, tasks] = await Promise.all([listBoards(), listTasks(board)]);
    return { board, boards, tasks };
  });
}
