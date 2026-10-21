import { handle, body } from "@/lib/server/http";
import { getCarousel, updateCarousel } from "@/lib/server/carousels";
import { renderAll } from "@/lib/server/render";
import { postizClient, cleanPostOptions } from "@/lib/server/postiz";
import { schedulePost, blockIfPending } from "@/lib/server/social-posts";

// Posts or schedules a carousel. Only runs when Marcus clicks Post now or Schedule on the Post step.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await body<{ channelIds?: string[]; when?: string; now?: boolean; caption?: string; overrideReason?: string; options?: unknown }>(req);
  return handle(async () => {
    const car = getCarousel(id);
    if (!car.slides.length) throw new Error("Write the slides first.");
    const caption = String(b.caption ?? car.caption ?? "").trim();
    if (!caption) throw new Error("Add a caption first.");
    blockIfPending(car.id);
    const options = cleanPostOptions(b.options);
    const client = postizClient();
    const slides = (await renderAll(car)).map((s) => s.png);
    const record = await schedulePost({
      carouselId: car.id, channelIds: Array.isArray(b.channelIds) ? b.channelIds.map(String) : [], when: String(b.when ?? ""), now: !!b.now,
      caption, slides, aiGenerated: car.flags.includes("AI-made images"), overrideReason: b.overrideReason ? String(b.overrideReason).slice(0, 500) : null, options,
    }, client);
    const status = record.state === "scheduled" && !options.draft ? (b.now ? "posted" : "scheduled") : car.status;
    return { record, carousel: updateCarousel(car.id, { caption, status }) };
  });
}
