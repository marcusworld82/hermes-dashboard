import { handle, body } from "@/lib/server/http";
import { draftWorkflow } from "@/lib/server/workflows";

export async function POST(req: Request) {
  const { description } = await body<{ description?: string }>(req);
  return handle(() => {
    if (!description?.trim()) throw new Error("Describe what the workflow should do.");
    return draftWorkflow(description.trim());
  });
}
