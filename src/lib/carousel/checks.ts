import { findBanned } from "./banned.ts";
import { HOOK_FORMULAS, type Carousel } from "./types.ts";
import { templateById } from "./templates.ts";

// The Review step checklist, from Wiki/Social Media.md. Marcus can post anyway, but has to give a reason.
export type Check = { id: string; label: string; ok: boolean; detail?: string };

const HOOK_PATTERNS = [/^stop\b/i, /\bnobody (tells|told)\b/i, /^how to\b.*\bwithout\b/i, /^i (made|built|grew|went|tried)\b.*/i];

export function hookMatches(car: Carousel): boolean {
  const chosen = car.hooks.find((h) => h.text === car.hook);
  if (chosen?.formula && (HOOK_FORMULAS as readonly string[]).includes(chosen.formula)) return true;
  const text = (car.slides[0]?.headline || car.hook || "").replace(/\*/g, "").trim();
  return HOOK_PATTERNS.some((p) => p.test(text));
}

export function runChecks(car: Carousel, banned: string[], renderFlags: string[]): Check[] {
  const tpl = templateById(car.template);
  const allText = [...car.slides.flatMap((s) => [s.headline, s.body]), car.caption].join("\n");
  const found = findBanned(allText, banned);
  const dashes = /—/.test(allText);
  const last = car.slides[car.slides.length - 1];
  const single = car.inputs.output === "single";
  const shrunk = renderFlags.filter((f) => /shrank/.test(f));
  const hashtags = (car.caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
  return [
    { id: "size", label: car.size === "4:5" ? "Size 1080x1350 (4:5, ad-safe)" : "Size 1080x1440 (3:4)", ok: true },
    { id: "safe", label: "All text inside the safe zone at a readable size", ok: shrunk.length === 0, detail: shrunk.join(" ") || undefined },
    { id: "hook", label: "Cover uses an approved hook formula", ok: hookMatches(car), detail: `Formulas: ${HOOK_FORMULAS.join(", ")}` },
    { id: "structure", label: `Structure: ${car.inputs.structure}`, ok: !!car.inputs.structure },
    { id: "colors", label: "3-color rule (one background, one text, one accent)", ok: car.mode !== "clone" || !!car.clone.spec || car.useBrandColors, detail: tpl.style && !car.useBrandColors ? `${tpl.name} colors` : "Brand colors" },
    { id: "fonts", label: "One display font and one body font", ok: true },
    { id: "banned", label: "No banned words or em dashes", ok: !found.length && !dashes, detail: [...found.map((w) => `"${w}"`), ...(dashes ? ["em dash"] : [])].join(", ") || undefined },
    { id: "cta", label: single ? "Single post (no CTA slide needed)" : `Last slide is a CTA for the "${car.inputs.goal}" goal`, ok: single || last?.kind === "cta" },
    { id: "handle", label: "Handle bottom-left, nothing top-left", ok: car.mode === "screenshot" || car.slides.every((s) => s.showHandle) },
    { id: "caption", label: "Caption written, with 3 hashtags", ok: car.caption.trim().length > 0 && hashtags === 3, detail: car.caption.trim() ? `${hashtags} hashtags` : "No caption yet" },
  ];
}
