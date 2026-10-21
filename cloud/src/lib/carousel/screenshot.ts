import type { Carousel, Slide } from "./types.ts";
import { fitText, safeBox } from "./layout.ts";

export const SCREENSHOT_MIN_TEXT = 36;
export const screenshotWantsImage = (car: Carousel) => car.template === "screenshot-image" || car.inputs.includeImages;

export function screenshotLayout(car: Carousel, slide: Slide, hasImage: boolean) {
  const box = safeBox(car.size);
  const imageHeight = screenshotWantsImage(car) && (hasImage || car.inputs.includeImages || car.template === "screenshot-image") ? Math.round(box.h * 0.38) : 0;
  const availableTextHeight = box.h - 150 - imageHeight - (imageHeight ? 40 : 0);
  const text = [slide.headline, slide.body].filter((s) => s.trim()).join("\n\n").replace(/\*/g, "");
  const measured = fitText(text, { box: { w: box.w, h: availableTextHeight }, maxPx: Math.round((slide.kind === "cover" ? 84 : 62) * (slide.textScale || 1)), minPx: SCREENSHOT_MIN_TEXT, lineHeight: 1.3, charWidth: 0.55 });
  return { ...measured, imageHeight, availableTextHeight, text };
}
