import { getCarousel } from "@/lib/server/carousels";
import { renderSlide } from "@/lib/server/render";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  try {
    const car = getCarousel(id);
    const { png, flags } = await renderSlide(car, Number(n), { preview: new URL(req.url).searchParams.get("preview") === "1" });
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "no-store", "x-slide-flags": encodeURIComponent(JSON.stringify(flags)) } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
