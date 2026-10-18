import { handle } from "@/lib/server/http";
import { saveMedia, listMedia } from "@/lib/server/carousels";

export async function GET() {
  return handle(() => ({ files: listMedia().slice(0, 200) }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const out: string[] = [];
    for (const f of form.getAll("file")) {
      if (!(f instanceof File)) continue;
      out.push(saveMedia(Buffer.from(await f.arrayBuffer()), f.type, f.name).file);
    }
    if (!out.length) throw new Error("Choose an image to upload.");
    return { files: out };
  });
}
