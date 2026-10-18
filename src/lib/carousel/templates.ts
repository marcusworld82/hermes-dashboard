import type { Mode } from "./types.ts";

// Template catalog shared by the page (gallery, layout pickers) and the renderer.
// Creative looks are rebuilt from scratch after studying Scorper's gallery (see docs/superpowers/specs/scorper-templates/notes.md).

export type ImagePlacement = "none" | "below" | "full" | "framed";
export type Deco = "counter" | "dashed-frame" | "glow" | "highlight" | "tape-card" | "dashed-body" | "mono-footer" | "vignette" | "handle-pill" | "image-border" | "italic-accent" | "script-accent" | "grain";

export type CreativeStyle = {
  bg: string;
  text: string;
  accent: string;
  display: string;
  body: string;
  textCase: "upper" | "title" | "sentence";
  align: "left" | "center";
  headlineMax: number;
  image: ImagePlacement;
  deco: Deco[];
};

export type TemplateDef = { id: string; mode: Mode; name: string; layouts: { id: string; name: string }[]; style?: CreativeStyle };

const one = [{ id: "default", name: "Default" }];

const creative = (id: string, name: string, style: CreativeStyle): TemplateDef => ({ id, mode: "creative", name, layouts: one, style });

export const TEMPLATES: TemplateDef[] = [
  { id: "screenshot", mode: "screenshot", name: "Screenshot", layouts: one },
  creative("moola", "Moola", { bg: "#1C1C1C", text: "#FFFFFF", accent: "#FFFFFF", display: "anton", body: "inter", textCase: "upper", align: "left", headlineMax: 150, image: "none", deco: [] }),
  creative("bookworm", "Bookworm", { bg: "#15130F", text: "#E8B21C", accent: "#E8B21C", display: "anton", body: "inter", textCase: "upper", align: "center", headlineMax: 130, image: "below", deco: ["counter", "grain"] }),
  creative("brock", "Brock", { bg: "#FFFFFF", text: "#111111", accent: "#111111", display: "inter", body: "inter", textCase: "title", align: "center", headlineMax: 78, image: "below", deco: [] }),
  creative("ironpress", "Iron Press", { bg: "#F4EFE6", text: "#111111", accent: "#E0379A", display: "anton", body: "inter", textCase: "upper", align: "center", headlineMax: 140, image: "below", deco: ["dashed-frame", "glow"] }),
  creative("sketch", "Sketch", { bg: "#050505", text: "#FFFFFF", accent: "#F07A5A", display: "inter", body: "inter", textCase: "sentence", align: "center", headlineMax: 92, image: "below", deco: ["dashed-body"] }),
  creative("greg", "Greg", { bg: "#CDBBA0", text: "#111111", accent: "#F2A7B5", display: "permanent-marker", body: "caveat", textCase: "upper", align: "center", headlineMax: 104, image: "none", deco: ["highlight", "tape-card"] }),
  creative("electro", "Electro", { bg: "#D7261E", text: "#F6E7C8", accent: "#F6E7C8", display: "anton", body: "inter", textCase: "upper", align: "center", headlineMax: 120, image: "below", deco: [] }),
  creative("passenger", "Passenger", { bg: "#0E0E0E", text: "#F2F2F2", accent: "#9A9A9A", display: "cormorant-garamond", body: "inter", textCase: "upper", align: "center", headlineMax: 96, image: "below", deco: ["vignette"] }),
  creative("mumbai", "Mumbai", { bg: "#EFEBE3", text: "#111111", accent: "#111111", display: "dm-serif-display", body: "inter", textCase: "title", align: "center", headlineMax: 92, image: "below", deco: ["image-border"] }),
  creative("courtside", "Courtside", { bg: "#FBF6EA", text: "#111111", accent: "#F7D54A", display: "caveat", body: "caveat", textCase: "title", align: "center", headlineMax: 120, image: "below", deco: ["highlight"] }),
  creative("printo", "Printo", { bg: "#DCEFFB", text: "#111111", accent: "#3BA7E0", display: "fredoka", body: "caveat", textCase: "title", align: "center", headlineMax: 120, image: "none", deco: [] }),
  creative("earlybird", "Early bird", { bg: "#FFFFFF", text: "#D0302A", accent: "#D0302A", display: "homemade-apple", body: "caveat", textCase: "sentence", align: "left", headlineMax: 96, image: "none", deco: [] }),
  creative("bubblegum", "Bubblegum", { bg: "#F3F1EC", text: "#111111", accent: "#111111", display: "archivo-black", body: "space-mono", textCase: "upper", align: "left", headlineMax: 120, image: "none", deco: ["counter", "mono-footer"] }),
  creative("scratch", "Scratch", { bg: "#F2A93B", text: "#111111", accent: "#111111", display: "anton", body: "inter", textCase: "upper", align: "center", headlineMax: 110, image: "below", deco: ["handle-pill"] }),
  creative("ledger", "Ledger", { bg: "#C9442C", text: "#161616", accent: "#161616", display: "inter", body: "inter", textCase: "upper", align: "left", headlineMax: 84, image: "none", deco: ["italic-accent", "grain"] }),
  creative("matchbox", "Matchbox", { bg: "#E9E9E9", text: "#111111", accent: "#2B5BE0", display: "inter", body: "inter", textCase: "sentence", align: "left", headlineMax: 96, image: "none", deco: [] }),
  creative("concrete", "Concrete", { bg: "#0D0D0D", text: "#EDE6D6", accent: "#EDE6D6", display: "cormorant-garamond", body: "inter", textCase: "title", align: "center", headlineMax: 90, image: "below", deco: [] }),
  creative("point", "Point", { bg: "#1A1A1A", text: "#FFFFFF", accent: "#C6F135", display: "anton", body: "inter", textCase: "upper", align: "center", headlineMax: 150, image: "full", deco: [] }),
  creative("suave", "Suave", { bg: "#2A2622", text: "#FFFFFF", accent: "#FF4FA3", display: "playfair-display", body: "inter", textCase: "upper", align: "center", headlineMax: 110, image: "full", deco: ["script-accent"] }),
  creative("forest", "Forest", { bg: "#1E2A1E", text: "#F1E9DA", accent: "#F1E9DA", display: "instrument-serif", body: "inter", textCase: "upper", align: "left", headlineMax: 120, image: "framed", deco: ["italic-accent"] }),
  creative("matcha", "Matcha", { bg: "#2B3326", text: "#F4EEDF", accent: "#F4EEDF", display: "instrument-serif", body: "inter", textCase: "title", align: "center", headlineMax: 110, image: "full", deco: ["italic-accent"] }),
  creative("skyline", "Skyline", { bg: "#3A2414", text: "#F6E9D7", accent: "#F6E9D7", display: "cormorant-garamond", body: "inter", textCase: "upper", align: "left", headlineMax: 116, image: "framed", deco: ["italic-accent"] }),
  { id: "clone", mode: "clone", name: "Cloned style", layouts: one },
  { id: "photo", mode: "photo", name: "Photo", layouts: [{ id: "split", name: "Split" }, { id: "single", name: "Single" }, { id: "hook", name: "Hook" }, { id: "before-after", name: "Before/After" }, { id: "started-going", name: "Started vs Going" }] },
  { id: "editorial", mode: "editorial", name: "Editorial", layouts: [{ id: "cover", name: "Cover" }, { id: "story", name: "Story" }] },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
export const templatesFor = (mode: Mode) => TEMPLATES.filter((t) => t.mode === mode);
export const defaultTemplate = (mode: Mode) => templatesFor(mode)[0]?.id ?? "screenshot";

// Headlines mark their key word with *asterisks*; templates color, italicize or highlight it.
export function splitAccent(text: string): { word: string; accent: boolean }[] {
  const out: { word: string; accent: boolean }[] = [];
  let on = false;
  for (const part of text.split(/(\*)/)) {
    if (part === "*") { on = !on; continue; }
    for (const w of part.split(/\s+/).filter(Boolean)) out.push({ word: w, accent: on });
  }
  return out;
}
export const plain = (text: string) => text.replace(/\*/g, "");

export function applyCase(text: string, c: "upper" | "title" | "sentence") {
  if (c === "upper") return text.toUpperCase();
  if (c === "title") return text.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  return text;
}
