import type { NextRequest } from "next/server";
import { handle, body } from "@/lib/server/http";
import { deleteWorkflow, listWorkflows, saveWorkflow, type Workflow } from "@/lib/server/workflows";
import { getAgents } from "@/lib/server/agents";
import { getSettings } from "@/lib/server/settings";

export async function GET() {
  return handle(async () => ({
    workflows: listWorkflows(),
    agents: (await getAgents()).map((a) => ({ id: a.id, name: a.name, short: a.short, color: a.color })),
    settings: getSettings(),
  }));
}

export async function POST(req: Request) {
  const b = await body<Workflow>(req);
  return handle(() => saveWorkflow(b), 201);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  return handle(() => {
    deleteWorkflow(id);
    return { ok: true };
  });
}
