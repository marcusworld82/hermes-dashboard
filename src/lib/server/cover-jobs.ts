import { getCarousel, updateCarousel } from "./carousels.ts";
import { readJson, updateJson, newId } from "./store.ts";
import { generateWithCodex } from "./images-codex.ts";
import { buildMarcusCoverRequest } from "./marcus-covers.ts";
import { coverMayAttach, COVER_STYLES, type CoverJob } from "../carousel/covers.ts";
import type { Carousel } from "../carousel/types.ts";

type Request = { prompt: string; references: string[] };
type Options = { request?: Request; generate?: (request: Request) => Promise<{ file: string }> };
const jobs = () => readJson<CoverJob[]>("carousel-cover-jobs", []);
function save(job: CoverJob) { updateJson<CoverJob[]>("carousel-cover-jobs", [], (rows) => [job, ...rows.filter((r) => r.id !== job.id)].slice(0, 200)); }
export function getCoverJob(id: string) {
  const job = jobs().find((j) => j.id === id);
  if (job?.status === "running" && Date.now() - Date.parse(job.createdAt) > 6 * 60_000) {
    const interrupted: CoverJob = { ...job, status: "error", error: "This cover run ended or was interrupted. Check your media library before starting another run." };
    save(interrupted); return interrupted;
  }
  return job ?? null;
}
export function latestCoverJob(carouselId: string) { const job = jobs().find((j) => j.carouselId === carouselId); return job ? getCoverJob(job.id) : null; }

export function startCoverJob(car: Carousel, styleId: number, direction: string, options: Options = {}) {
  const existing = latestCoverJob(car.id);
  if (existing?.status === "running") return existing;
  if (!COVER_STYLES.some((s) => s.id === styleId)) throw new Error("Choose a saved Marcus cover style.");
  if (!car.slides[0]) throw new Error("Write your carousel slides before creating a cover.");
  const request = options.request ?? buildMarcusCoverRequest(car, styleId, direction);
  const job: CoverJob = { id: newId("cover"), carouselId: car.id, status: "running", styleId, createdAt: new Date().toISOString() };
  save(job);
  const generate = options.generate ?? ((r: Request) => generateWithCodex(r.prompt, car.size, { purpose: "cover", references: r.references }));
  // The local Hermes service owns the process. Cloud requests return the job ID and poll it.
  void (async () => {
    try {
      const { file } = await generate(request);
      const fresh = getCarousel(car.id);
      const attached = coverMayAttach(fresh, car);
      if (attached) updateCarousel(car.id, { cover: { image: file, source: "marcus", fit: "contain", styleId }, flags: [...fresh.flags.filter((f) => f !== "AI-made images"), "AI-made images"] });
      save({ ...job, status: "ready", file, attached });
    } catch (e) {
      save({ ...job, status: "error", error: (e as Error).message || "The cover could not be created. No alternate provider was used." });
    }
  })();
  return job;
}
