import type { Carousel } from "./types.ts";
export const COVER_STYLES = [
  { id: 1, label: "Orange print editorial" }, { id: 2, label: "Red theatrical typography" },
  { id: 3, label: "Dark teal editorial, refined spacing" }, { id: 4, label: "Travel print, revised palette" },
  { id: 5, label: "Chartreuse studio collage" }, { id: 7, label: "Monochrome fisheye" },
  { id: 8, label: "Concept cards, revised palette" }, { id: 10, label: "Plum perspective" },
  { id: 11, label: "Mustard street poster" }, { id: 12, label: "Cyan screenprint" },
] as const;
export function finishedCoverForSlide(car: Carousel, index: number) {
  return index === 0 && car.cover?.image ? car.cover : null;
}
export function coverMayAttach(fresh: Carousel, started: Carousel) {
  return JSON.stringify(fresh.cover ?? null) === JSON.stringify(started.cover ?? null)
    && fresh.slides[0]?.id === started.slides[0]?.id
    && fresh.slides[0]?.headline === started.slides[0]?.headline
    && fresh.slides[0]?.body === started.slides[0]?.body;
}
export type CoverJob = { id: string; carouselId: string; status: "running" | "ready" | "error"; styleId: number; createdAt: string; file?: string; attached?: boolean; error?: string };
