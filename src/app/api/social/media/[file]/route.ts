import { readMedia } from "@/lib/server/carousels";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  try {
    const { bytes, mime } = readMedia(file);
    return new Response(new Uint8Array(bytes), { headers: { "content-type": mime, "cache-control": "private, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
