import { handle, body } from "@/lib/server/http";
import { getCarousel } from "@/lib/server/carousels";
import { requireRuns } from "@/lib/server/settings";
import { latestCoverJob, startCoverJob } from "@/lib/server/cover-jobs";
import { COVER_STYLES } from "@/lib/carousel/covers";
import { marcusCoverAvailable } from "@/lib/server/marcus-covers";

export async function GET(req: Request) {
  return handle(() => {
    const id = new URL(req.url).searchParams.get("carouselId");
    const car = id ? getCarousel(id) : null;
    const job = id ? latestCoverJob(id) : null;
    return { available: marcusCoverAvailable(), styles: COVER_STYLES, job: job ? { ...job, attached: job.status === "ready" && car?.cover?.image === job.file } : null };
  });
}
export async function POST(req: Request) {
  const b = await body<{ carouselId?: string; styleId?: number; direction?: string }>(req);
  return handle(() => {
    requireRuns();
    const car = getCarousel(String(b.carouselId));
    if (car.status !== "draft") throw new Error("Create a draft copy before changing a scheduled or posted carousel.");
    return { job: startCoverJob(car, Number(b.styleId), String(b.direction || "")) };
  }, 202);
}
