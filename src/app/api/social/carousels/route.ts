import path from "node:path";
import { handle, body } from "@/lib/server/http";
import { createCarousel, listCarousels } from "@/lib/server/carousels";
import { getBrandKits } from "@/lib/server/brand-kits";
import { readSocialPlan } from "@/lib/server/social-plan";
import { paths } from "@/lib/server/paths";
import type { Carousel } from "@/lib/carousel/types";

export async function GET() {
  return handle(() => ({ carousels: listCarousels(), brands: getBrandKits() }));
}

// A planned calendar entry (planId) starts a draft pre-filled from the plan. Pressing it twice opens the same draft.
function fromPlan(planId: string) {
  const existing = listCarousels().find((c) => c.planId === planId);
  if (existing) return existing;
  const plan = readSocialPlan(path.join(paths.data, "social-content-plan.json")).items.find((p) => p.id === planId);
  if (!plan) throw new Error("That planned post was not found. Refresh the calendar.");
  const single = /^(post|static|single)$/i.test(plan.format) || /^static/i.test(plan.title);
  return createCarousel({
    title: plan.title.slice(0, 200), planId: plan.id, planDate: plan.date,
    caption: plan.captions.instagram ?? Object.values(plan.captions)[0] ?? "",
    inputs: { topic: plan.title, steer: "", context: plan.body.slice(0, 12000), referenceUrl: "", referenceText: "", includeImages: false, goal: "saves", structure: "Listicle", slideCount: single ? 1 : 7, badge: "blue", output: single ? "single" : "carousel" },
  });
}

export async function POST(req: Request) {
  const b = await body<Partial<Carousel>>(req);
  return handle(() => ({ carousel: typeof b.planId === "string" ? fromPlan(b.planId) : createCarousel({ title: typeof b.title === "string" ? b.title.slice(0, 200) : "", mode: b.mode, template: b.template }) }));
}
