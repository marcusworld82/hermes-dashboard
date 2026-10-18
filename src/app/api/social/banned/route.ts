import { handle, body } from "@/lib/server/http";
import { getBanned, saveBanned } from "@/lib/server/banned-store";

export async function GET() {
  return handle(() => ({ banned: getBanned() }));
}
export async function POST(req: Request) {
  const b = await body<{ banned?: string[] }>(req);
  return handle(() => ({ banned: saveBanned(Array.isArray(b.banned) ? b.banned : []) }));
}
