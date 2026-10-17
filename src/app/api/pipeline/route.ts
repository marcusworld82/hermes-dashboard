import { handle, body } from "@/lib/server/http";
import { capture, listPipeline } from "@/lib/server/pipeline";

export async function GET() {
  return handle(() => listPipeline());
}

export async function POST(req: Request) {
  const { idea } = await body<{ idea?: string }>(req);
  return handle(() => capture(String(idea ?? "")), 201);
}
