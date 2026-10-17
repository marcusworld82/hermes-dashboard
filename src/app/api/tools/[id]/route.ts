import { headers } from "next/headers";
import { handle, isLocalHost } from "@/lib/server/http";
import { isTool, startTool, toolStatus } from "@/lib/server/tools";

// These tools run on this Mac only, so they are refused from any other host name.
async function guard(id: string) {
  if (!isLocalHost((await headers()).get("host"))) throw new Error("This tool opens on your Mac only.");
  if (!isTool(id)) throw new Error("Unknown tool.");
  return id;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => toolStatus(await guard(id)));
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => startTool(await guard(id)));
}
