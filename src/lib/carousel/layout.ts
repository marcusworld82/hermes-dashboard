import type { Size } from "./types.ts";

// Instagram carousel specs from Wiki/Social Media.md: 1080x1440 (3:4), or 1080x1350 (4:5) when the post may be boosted.
// Safe zone: 180px top and bottom, 50px left, 120px right (slide counter and icons sit on the right).
export const SAFE = { top: 180, bottom: 180, left: 50, right: 120 } as const;

export function canvas(size: Size): { w: 1080; h: 1440 | 1350 } {
  return { w: 1080, h: size === "4:5" ? 1350 : 1440 };
}

export function safeBox(size: Size) {
  const { w, h } = canvas(size);
  return { x: SAFE.left, y: SAFE.top, w: w - SAFE.left - SAFE.right, h: h - SAFE.top - SAFE.bottom };
}

type FitOpts = { box: { w: number; h: number }; maxPx: number; minPx: number; lineHeight: number; charWidth: number };

// Estimates the largest font size (stepping down 2px) at which the text fits the box.
// charWidth is the average glyph width as a fraction of the font size for the chosen font.
export function fitText(text: string, opts: FitOpts): { px: number; lines: number; fits: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const measure = (px: number) => {
    const perLine = Math.max(1, Math.floor(opts.box.w / (opts.charWidth * px)));
    let lines = words.length ? 1 : 0;
    let used = 0;
    for (const w of words) {
      const len = Math.min(w.length, perLine);
      if (used === 0) used = len;
      else if (used + 1 + len <= perLine) used += 1 + len;
      else { lines++; used = len; }
    }
    return { lines, fits: lines * px * opts.lineHeight <= opts.box.h };
  };
  for (let px = opts.maxPx; px > opts.minPx; px -= 2) {
    const m = measure(px);
    if (m.fits) return { px, ...m };
  }
  const m = measure(opts.minPx);
  return { px: opts.minPx, ...m };
}
