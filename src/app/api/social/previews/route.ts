import { renderSlide } from "@/lib/server/render";
import { getBrandKit } from "@/lib/server/brand-kits";
import { listMedia } from "@/lib/server/carousels";
import { makeStylePreview } from "@/lib/carousel/previews";
import type { Mode, Size, Theme } from "@/lib/carousel/types";



// Uses the export renderer without creating drafts or starting any model jobs.
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const index = Number(q.get("index") || 0);
    if (!Number.isInteger(index) || index < 0 || index > 1) throw new Error("Choose cover or inner slide.");
    const size = (q.get("size") || "3:4") as Size;
    const theme = (q.get("theme") || "dark") as Theme;
    if (!["3:4", "4:5"].includes(size) || !["light", "dark", "brand"].includes(theme)) throw new Error("Unknown preview setting.");
    const kit = getBrandKit(q.get("brandId") || "lyfe");
    const car = makeStylePreview((q.get("mode") || "screenshot") as Mode, {
      template: q.get("template") || undefined, layout: q.get("layout") || undefined, brandId: kit.id, size, theme,
      sampleImage: kit.avatar || listMedia()[0],
    });
    const { png, flags } = await renderSlide(car, index, { preview: true });
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "private, no-store", "x-slide-flags": encodeURIComponent(JSON.stringify(flags)) } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
