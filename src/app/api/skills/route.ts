import { handle, body } from "@/lib/server/http";
import { assignSkill, discardUpload, installUpload, saveUpload, skillsOverview } from "@/lib/server/skills";

export async function GET() {
  return handle(() => skillsOverview());
}

// Upload: multipart form with "name" and one or more "files" (relative paths kept in the file name).
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const name = String(form.get("name") ?? "");
    const files: { path: string; content: Buffer }[] = [];
    for (const entry of form.getAll("files")) {
      if (typeof entry === "string") continue;
      files.push({ path: entry.name, content: Buffer.from(await entry.arrayBuffer()) });
    }
    return { name: saveUpload(name, files) };
  }, 201);
}

export async function PATCH(req: Request) {
  const b = await body<{ action?: string; name?: string; agents?: string[] }>(req);
  return handle(() => {
    const name = String(b.name ?? "");
    if (b.action === "install") return { name: installUpload(name) };
    if (b.action === "discard") {
      discardUpload(name);
      return { ok: true };
    }
    if (b.action === "assign") return assignSkill(name, Array.isArray(b.agents) ? b.agents.map(String) : []);
    throw new Error("Unknown action.");
  });
}
