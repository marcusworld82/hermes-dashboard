import { body } from "@/lib/server/http";
import { renderSlide } from "@/lib/server/render";
import type { Carousel } from "@/lib/carousel/types";

// Live preview of unsaved edits. Same renderer as the saved slides and the posted PNGs.
export async function POST(req: Request) {
  const b = await body<{ carousel?: Carousel; index?: number }>(req);
  try {
    if (!b.carousel || !Array.isArray(b.carousel.slides)) throw new Error("Nothing to preview.");
    const { png, flags } = await renderSlide(b.carousel, Number(b.index ?? 0), { preview: true });
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "no-store", "x-slide-flags": encodeURIComponent(JSON.stringify(flags)) } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
