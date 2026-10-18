import { handle, body } from "@/lib/server/http";
import { requireRuns } from "@/lib/server/settings";
import { getCarousel, updateCarousel } from "@/lib/server/carousels";
import { generateWithCodex } from "@/lib/server/images-codex";
import { generateWithHiggsfield } from "@/lib/server/higgsfield";

// Makes one image and puts it on a slide. Codex uses the ChatGPT plan; Higgsfield needs a quote Marcus approved.
export async function POST(req: Request) {
  const b = await body<{ carouselId?: string; slideIndex?: number; slot?: number; provider?: "codex" | "higgsfield"; prompt?: string; quoteId?: string }>(req);
  return handle(async () => {
    requireRuns();
    const car = getCarousel(String(b.carouselId));
    const i = Number(b.slideIndex), slot = Number(b.slot) === 1 ? 1 : 0;
    if (!car.slides[i]) throw new Error("That slide doesn't exist.");
    let file: string;
    if (b.provider === "higgsfield") {
      if (!b.quoteId) throw new Error("Approve the price first.");
      file = (await generateWithHiggsfield(b.quoteId)).file;
    } else {
      file = (await generateWithCodex(String(b.prompt ?? ""), car.size)).file;
    }
    const fresh = getCarousel(car.id);
    const slides = fresh.slides.map((s, n) => {
      if (n !== i) return s;
      const images = [...s.images];
      images[slot] = file;
      return { ...s, images: images.map((x) => x ?? "") };
    });
    return { carousel: updateCarousel(car.id, { slides, flags: b.provider === "higgsfield" || b.provider === "codex" ? [...fresh.flags.filter((f) => f !== "AI-made images"), "AI-made images"] : fresh.flags }), file };
  });
}
