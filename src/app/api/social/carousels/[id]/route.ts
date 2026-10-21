import { handle, body } from "@/lib/server/http";
import { getCarousel, updateCarousel, deleteCarousel, createCarousel } from "@/lib/server/carousels";
import type { Carousel } from "@/lib/carousel/types";

type Ctx = { params: Promise<{ id: string }> };
const EDITABLE = ["mode", "template", "size", "theme", "useBrandColors", "title", "inputs", "hook", "hooks", "ideas", "news", "slides", "caption", "clone", "cover", "flags"] as const;

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(() => ({ carousel: getCarousel(id) }));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const b = await body<Partial<Carousel> & { duplicate?: boolean }>(req);
  return handle(() => {
    if (b.duplicate) {
      const src = getCarousel(id);
      return { carousel: createCarousel({ ...src, id: undefined, title: `${src.title} (copy)`, status: "draft" } as Partial<Carousel>) };
    }
    const patch: Partial<Carousel> = {};
    for (const k of EDITABLE) if (k in b) (patch as Record<string, unknown>)[k] = b[k];
    return { carousel: updateCarousel(id, patch) };
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(() => { deleteCarousel(id); return { ok: true }; });
}
