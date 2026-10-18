import { handle, body } from "@/lib/server/http";
import { getCarousel, updateCarousel } from "@/lib/server/carousels";
import { generate, type Step } from "@/lib/server/carousel-ai";
import { carouselDeps } from "@/lib/server/carousel-deps";

const STEPS: Step[] = ["ideas", "news", "hooks", "slides", "slide", "caption", "clone"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await body<{ step?: Step; index?: number }>(req);
  return handle(async () => {
    if (!b.step || !STEPS.includes(b.step)) throw new Error("Unknown step.");
    const car = getCarousel(id);
    if (b.step === "clone" && !car.clone.cover) throw new Error("Upload a cover slide to clone first.");
    const { flags, ...patch } = await generate(b.step, car, { index: b.index }, carouselDeps(car.brandId));
    const keep = car.flags.filter((f) => !f.startsWith("Banned phrase"));
    return { carousel: updateCarousel(id, { ...patch, flags: [...keep, ...flags] }), flags };
  });
}
