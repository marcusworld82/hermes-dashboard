import type { Carousel, Mode, Size, Theme } from "./types.ts";
import { defaultTemplate, templateById } from "./templates.ts";

const MODES: Mode[] = ["screenshot", "creative", "clone", "photo", "editorial"];
export type PreviewOptions = { template?: string; layout?: string; sampleImage?: string; brandId?: string; size?: Size; theme?: Theme };

// Ephemeral examples only. No saved draft, AI call, scheduling or publishing state is created.
export function makeStylePreview(mode: Mode, options: PreviewOptions = {}): Carousel {
  if (!MODES.includes(mode)) throw new Error("Unknown carousel style.");
  const template = options.template || defaultTemplate(mode);
  const definition = templateById(template);
  if (definition.id !== template || definition.mode !== mode) throw new Error("Choose a template for this carousel style.");
  const layout = options.layout || definition.layouts[0].id;
  if (!definition.layouts.some((l) => l.id === layout)) throw new Error("Unknown slide layout.");
  const images = options.sampleImage ? [options.sampleImage] : [];
  return {
    id: "style-preview", brandId: options.brandId || "lyfe", mode, template, size: options.size || "3:4", theme: options.theme || "dark", useBrandColors: false,
    title: "Style example", ideas: [], news: [], hooks: [], hook: "Start with the business problem", caption: "", flags: [], status: "draft", createdAt: "", updatedAt: "",
    inputs: { topic: "A useful business workflow", steer: "", context: "", referenceUrl: "", referenceText: "", includeImages: mode === "screenshot" ? template === "screenshot-image" : true, goal: "saves", structure: "Listicle", slideCount: 3, badge: "none", output: "carousel" },
    slides: [
      { id: "example-cover", kind: "cover", layout, headline: "Start with the *business problem*", body: "Then choose the tool and the next useful step.", images: [...images], textScale: 1, dim: 40, showHandle: true },
      { id: "example-inner", kind: "body", layout, headline: "Make the *next step* clear", body: "Pick one task.\nWrite down the inputs.\nTest the handoff with your team.", images: [...images], textScale: 1, dim: 40, showHandle: true },
    ],
    clone: { cover: null, inner: [], spec: mode === "clone" ? { bg: "#F5F0E8", text: "#121212", accent: "#51722B", displayFont: "dm-serif-display", bodyFont: "inter", align: "left", headlineCase: "sentence", imagePlacement: "none", notes: "Style example only. Upload your reference to preview its analyzed style." } : null },
  };
}

export function previewRequestKey(car: Carousel, index: number): string {
  // Include every renderer input, including the brand and all unsaved edits.
  return JSON.stringify({ carousel: car, index });
}
