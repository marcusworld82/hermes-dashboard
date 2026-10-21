import { handle } from "@/lib/server/http";
import { reconcilePipeline } from "@/lib/server/pipeline";

export async function POST() {
  return handle(() => reconcilePipeline());
}
