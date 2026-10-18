import { getCarousel } from "@/lib/server/carousels";
import { renderAll } from "@/lib/server/render";
import { zip } from "@/lib/server/zip";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const car = getCarousel(id);
    const slides = await renderAll(car);
    const name = (car.title || "carousel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "carousel";
    const file = zip(slides.map((s, i) => ({ name: `${name}-${String(i + 1).padStart(2, "0")}.png`, data: s.png })));
    return new Response(new Uint8Array(file), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}.zip"` } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
