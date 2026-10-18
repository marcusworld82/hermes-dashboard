import { handle, body } from "@/lib/server/http";
import { createCarousel, listCarousels } from "@/lib/server/carousels";
import { getBrandKits } from "@/lib/server/brand-kits";
import type { Carousel } from "@/lib/carousel/types";

export async function GET() {
  return handle(() => ({ carousels: listCarousels(), brands: getBrandKits() }));
}

export async function POST(req: Request) {
  const b = await body<Partial<Carousel>>(req);
  return handle(() => ({ carousel: createCarousel({ title: typeof b.title === "string" ? b.title.slice(0, 200) : "", mode: b.mode, template: b.template }) }));
}
