import type { NextRequest } from "next/server";
import { handle, body } from "@/lib/server/http";
import { deleteGroup, listGroups, saveGroup } from "@/lib/server/chat";

export async function GET() {
  return handle(() => listGroups());
}

export async function POST(req: Request) {
  const b = await body<{ id?: string; name: string; members: string[]; lead?: string }>(req);
  return handle(() => saveGroup({ ...b, members: Array.isArray(b.members) ? b.members.map(String) : [] }), 201);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  return handle(() => {
    deleteGroup(id);
    return { ok: true };
  });
}
