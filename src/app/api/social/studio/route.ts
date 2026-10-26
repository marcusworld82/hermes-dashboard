import { handle, body } from "@/lib/server/http";
import { STUDIO_SKILLS, listDrafts, startDraft, editDraft, approveDraft, publishDraft, metricoolConnected } from "@/lib/server/social-studio";

export async function GET() {
  return handle(() => ({ skills: STUDIO_SKILLS.map(({ id, label, platform, publishable }) => ({ id, label, platform, publishable })), drafts: listDrafts(), metricool: metricoolConnected() }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const input = await body(req);
    const id = typeof input.id === "string" ? input.id : "";
    if (input.action === "start") return startDraft(input);
    if (input.action === "edit") return editDraft(id, input.output);
    if (input.action === "approve") return approveDraft(id, input.scheduledFor);
    if (input.action === "publish") return publishDraft(id);
    throw new Error("Unknown action.");
  });
}
