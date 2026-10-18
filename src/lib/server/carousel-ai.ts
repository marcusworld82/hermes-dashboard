import crypto from "node:crypto";
import { findBanned, stripDashes } from "../carousel/banned.ts";
import { HOOK_FORMULAS, STRUCTURES, type BrandKit, type Carousel, type CloneSpec, type Slide } from "../carousel/types.ts";
import { FONT_IDS } from "../carousel/fonts.ts";

// Writes carousel copy through Claude on this Mac (Claude desk). Every step returns a patch for the carousel.
// Banned phrases get one rewrite; anything left over comes back in `flags` for the Review step.

export type Step = "ideas" | "news" | "hooks" | "slides" | "slide" | "caption" | "clone";
export type Deps = {
  send: (prompt: string, opts?: { tools?: string[]; dirs?: string[] }) => Promise<string>;
  requireRuns: () => void;
  brand: BrandKit;
  banned: string[];
  foundation: string;
  mediaDir?: string;
};
export type Result = Partial<Carousel> & { flags: string[] };

export function parseJsonReply<T>(raw: string): T {
  const text = String(raw ?? "");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  for (const candidate of [fenced, text]) {
    if (!candidate) continue;
    const start = candidate.search(/[[{]/);
    if (start < 0) continue;
    const open = candidate[start];
    const end = candidate.lastIndexOf(open === "{" ? "}" : "]");
    if (end <= start) continue;
    try { return JSON.parse(candidate.slice(start, end + 1)) as T; } catch {}
  }
  throw new Error("Claude's answer couldn't be read. Try again.");
}

const clean = (s: unknown, max = 600) => stripDashes(String(s ?? "").trim()).slice(0, max);
const sid = () => `sl_${crypto.randomBytes(5).toString("hex")}`;

function context(car: Carousel, d: Deps) {
  const i = car.inputs;
  return [
    `Brand: ${d.brand.name} (${d.brand.handle}). Spell it "Lyfe", never "Life".`,
    d.foundation ? `Brand foundation and editorial rules (follow these):\n${d.foundation.slice(0, 14000)}` : "",
    `Carousel title: ${car.title || "(none yet)"}`,
    i.topic ? `Topic: ${i.topic}` : "",
    i.context ? `Extra context from Marcus: ${i.context}` : "",
    i.referenceText ? `Reference material (use facts only from here or common knowledge):\n${i.referenceText.slice(0, 12000)}` : "",
    `Goal: ${i.goal}. Structure: ${i.structure}.`,
    `Writing rules: plain words a 12 year old follows. No em dashes. Never use these words or phrases: ${d.banned.join(", ")}. No made-up stats or quotes.`,
  ].filter(Boolean).join("\n\n");
}

const STRUCTURE_FLOW: Record<string, string> = {
  "Listicle": "Hook, Context, List, Bonus, CTA",
  "Storytelling": "Hook, Setup, Journey, Turning Point, Lesson, CTA",
  "Problem-Solution": "Hook, Problem, Cause, Solution, Outcome, CTA",
  "Myth vs Truth": "Hook, Myth, Why Wrong, Truth, Application, CTA",
  "Old vs New": "Hook, Old Way, New Way, What Changed, CTA",
  "Case Study Breakdown": "Hook, Result, What Changed, Breakdown, Lesson, CTA",
  "Framework/Matrix": "Hook, Big Idea, Framework, Examples, How to Use, CTA",
};

function prompt(step: Step, car: Carousel, opts: { index?: number }, d: Deps): string {
  const base = context(car, d);
  const count = car.inputs.output === "single" ? 1 : car.inputs.slideCount;
  switch (step) {
    case "ideas":
      return `${base}\n\nSuggest 6 punchy carousel topics for this brand's audience.${car.inputs.steer ? ` Steer: ${car.inputs.steer}.` : ""} Each under 60 characters, lowercase is fine.\nReply with JSON only: {"ideas": ["..."]}`;
    case "news":
      // No brand notes or reference text here: this step can search the web, so it only gets the topic.
      return `Brand audience: creators and small business owners interested in AI, automation and money.${car.inputs.topic ? ` Topic: ${car.inputs.topic}.` : ""}\n\nSearch the web for 3 news stories from the last 14 days that this brand's audience would care about (AI, automation, money, creators). Only include stories you found with a real URL.\nReply with JSON only: {"news": [{"title": "...", "url": "https://...", "summary": "one sentence"}]}`;
    case "hooks":
      return `${base}\n\nWrite 5 cover hooks for this carousel. Each must use one of these formulas: ${HOOK_FORMULAS.join(" | ")}. Under 70 characters each.\nReply with JSON only: {"hooks": [{"text": "...", "formula": "one of the formulas exactly"}]}`;
    case "slides":
      return `${base}\n\nChosen hook: ${car.hook || car.title}\nWrite ${count} slide${count > 1 ? "s" : ""} following this flow: ${STRUCTURE_FLOW[car.inputs.structure] ?? STRUCTURE_FLOW.Listicle}.\n${count > 1 ? `Slide 1 is the cover and uses the hook. The last slide is the call to action, matching the goal "${car.inputs.goal}" (reach: share or send, trust: follow, saves: save this, sales: DM a keyword, dms: comment a keyword).` : "This is a single post: put the whole idea on one slide."}\nKeep each headline under 60 characters and each body under 220 characters so it fits the safe zone. Bodies can be empty on the cover.\nReply with JSON only: {"slides": [{"headline": "...", "body": "..."}]}`;
    case "slide": {
      const i = opts.index ?? 0;
      const s = car.slides[i];
      return `${base}\n\nChosen hook: ${car.hook}\nAll slides so far:\n${car.slides.map((x, n) => `${n + 1}. ${x.headline} | ${x.body}`).join("\n")}\n\nRewrite slide ${i + 1} only (currently "${s?.headline} | ${s?.body}") so it's sharper and fits the flow. Headline under 60 characters, body under 220.\nReply with JSON only: {"headline": "...", "body": "..."}`;
    }
    case "caption":
      return `${base}\n\nSlides:\n${car.slides.map((x, n) => `${n + 1}. ${x.headline} ${x.body}`).join("\n")}\n\nWrite the Instagram caption: 250 to 400 words, short paragraphs of one or two sentences with a blank line between them, adds useful context beyond the slides, ends with a CTA matching the goal, then exactly 3 hashtags on the last line (start from: ${d.brand.hashtags.join(" ")}).\nReply with JSON only: {"caption": "..."}`;
    case "clone":
      return `Look at these carousel slides Marcus likes: ${[car.clone.cover, ...car.clone.inner].filter(Boolean).map((f) => `${d.mediaDir}/${f}`).join(", ")}.\nDescribe their visual style so it can be rebuilt. Pick fonts only from this list: ${FONT_IDS.join(", ")}.\nReply with JSON only: {"bg": "#hex", "text": "#hex", "accent": "#hex", "displayFont": "...", "bodyFont": "...", "align": "left|center", "headlineCase": "upper|title|sentence", "imagePlacement": "none|full|bottom|top", "notes": "one sentence"}`;
  }
}

function shape(step: Step, raw: unknown, car: Carousel, opts: { index?: number }, d: Deps): Result {
  const j = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  switch (step) {
    case "ideas": {
      const ideas = list(j.ideas).map((x) => clean(x, 120)).filter(Boolean).slice(0, 6);
      if (!ideas.length) throw new Error("Claude's answer couldn't be read. Try again.");
      return { ideas, flags: [] };
    }
    case "news": {
      const news = list(j.news).map((x) => x as Record<string, unknown>).map((x) => ({ title: clean(x.title, 200), url: String(x.url ?? ""), summary: clean(x.summary, 300) }))
        .filter((x) => x.title && /^https:\/\//.test(x.url)).slice(0, 3);
      return { news, flags: [] };
    }
    case "hooks": {
      const hooks = list(j.hooks).map((x) => x as Record<string, unknown>).map((x) => ({ text: clean(x.text, 140), formula: (HOOK_FORMULAS as readonly string[]).includes(String(x.formula)) ? String(x.formula) : "" }))
        .filter((x) => x.text).slice(0, 5);
      if (!hooks.length) throw new Error("Claude's answer couldn't be read. Try again.");
      return { hooks, flags: [] };
    }
    case "slides": {
      const items = list(j.slides).map((x) => x as Record<string, unknown>);
      if (!items.length) throw new Error("Claude's answer couldn't be read. Try again.");
      const keep = car.slides;
      const slides: Slide[] = items.slice(0, 10).map((x, n, all) => ({
        id: keep[n]?.id ?? sid(), kind: n === 0 && all.length > 1 ? "cover" : n === all.length - 1 && all.length > 1 ? "cta" : "body",
        layout: keep[n]?.layout ?? "default", headline: clean(x.headline, 160), body: clean(x.body, 500), images: keep[n]?.images ?? [],
        textScale: keep[n]?.textScale ?? 1, dim: keep[n]?.dim ?? 40, showHandle: keep[n]?.showHandle ?? true,
      }));
      return { slides, flags: [] };
    }
    case "slide": {
      const i = opts.index ?? 0;
      if (!car.slides[i]) throw new Error("That slide doesn't exist.");
      const slides = car.slides.map((s, n) => (n === i ? { ...s, headline: clean(j.headline, 160) || s.headline, body: clean(j.body, 500) } : s));
      return { slides, flags: [] };
    }
    case "caption": {
      const caption = clean(j.caption, 5000);
      if (!caption) throw new Error("Claude's answer couldn't be read. Try again.");
      return { caption, flags: [] };
    }
    case "clone": {
      const hex = (v: unknown, f: string) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : f);
      const font = (v: unknown, f: string) => (FONT_IDS.includes(String(v)) ? String(v) : f);
      const spec: CloneSpec = {
        bg: hex(j.bg, d.brand.colors.bg), text: hex(j.text, d.brand.colors.text), accent: hex(j.accent, d.brand.colors.accent),
        displayFont: font(j.displayFont, "anton"), bodyFont: font(j.bodyFont, "inter"),
        align: j.align === "center" ? "center" : "left", headlineCase: j.headlineCase === "title" || j.headlineCase === "sentence" ? j.headlineCase : "upper",
        imagePlacement: ["full", "bottom", "top"].includes(String(j.imagePlacement)) ? (j.imagePlacement as CloneSpec["imagePlacement"]) : "none",
        notes: clean(j.notes, 300),
      };
      return { clone: { ...car.clone, spec }, flags: [] };
    }
  }
}

function copyText(r: Result): string {
  return [...(r.ideas ?? []), ...(r.hooks ?? []).map((h) => h.text), ...(r.slides ?? []).flatMap((s) => [s.headline, s.body]), r.caption ?? ""].join("\n");
}

export async function generate(step: Step, car: Carousel, opts: { index?: number }, d: Deps): Promise<Result> {
  d.requireRuns();
  const tools = step === "news" ? ["WebSearch"] : step === "clone" ? ["Read"] : undefined;
  const dirs = step === "clone" && d.mediaDir ? [d.mediaDir] : undefined;
  let result = shape(step, parseJsonReply(await d.send(prompt(step, car, opts, d), { tools, dirs })), car, opts, d);
  let found = findBanned(copyText(result), d.banned);
  if (found.length && step !== "clone" && step !== "news") {
    const fix = `${prompt(step, car, opts, d)}\n\nYour last answer used these banned words or phrases: ${found.join(", ")}. Rewrite without them. Same JSON shape.`;
    try {
      result = shape(step, parseJsonReply(await d.send(fix)), car, opts, d);
      found = findBanned(copyText(result), d.banned);
    } catch {}
  }
  return { ...result, flags: found.map((w) => `Banned phrase: "${w}"`) };
}
