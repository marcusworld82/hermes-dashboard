// Fonts bundled in assets/fonts (all SIL OFL). charWidth is the average glyph width as a share of font size,
// used by fitText to keep text inside the safe zone.
export type FontDef = { id: string; family: string; files: { file: string; weight: number; style: "normal" | "italic" }[]; charWidth: number; caps?: boolean; lineHeight?: number };

export const FONTS: FontDef[] = [
  { id: "anton", family: "Anton", files: [{ file: "anton-400-normal.woff", weight: 400, style: "normal" }], charWidth: 0.46, caps: true },
  { id: "inter", family: "Inter", files: [{ file: "inter-400-normal.woff", weight: 400, style: "normal" }, { file: "inter-600-normal.woff", weight: 600, style: "normal" }, { file: "inter-800-normal.woff", weight: 800, style: "normal" }], charWidth: 0.55 },
  { id: "bebas-neue", family: "Bebas Neue", files: [{ file: "bebas-neue-400-normal.woff", weight: 400, style: "normal" }], charWidth: 0.4, caps: true },
  { id: "archivo-black", family: "Archivo Black", files: [{ file: "archivo-black-400-normal.woff", weight: 400, style: "normal" }], charWidth: 0.68 },
  { id: "oswald", family: "Oswald", files: [{ file: "oswald-700-normal.woff", weight: 700, style: "normal" }], charWidth: 0.5, caps: true },
  { id: "playfair-display", family: "Playfair Display", files: [{ file: "playfair-display-700-normal.woff", weight: 700, style: "normal" }, { file: "playfair-display-400-italic.woff", weight: 400, style: "italic" }], charWidth: 0.56 },
  { id: "cormorant-garamond", family: "Cormorant Garamond", files: [{ file: "cormorant-garamond-300-normal.woff", weight: 300, style: "normal" }, { file: "cormorant-garamond-500-italic.woff", weight: 500, style: "italic" }], charWidth: 0.46, lineHeight: 1.1 },
  { id: "dm-serif-display", family: "DM Serif Display", files: [{ file: "dm-serif-display-400-normal.woff", weight: 400, style: "normal" }], charWidth: 0.52 },
  { id: "instrument-serif", family: "Instrument Serif", files: [{ file: "instrument-serif-400-normal.woff", weight: 400, style: "normal" }, { file: "instrument-serif-400-italic.woff", weight: 400, style: "italic" }], charWidth: 0.44, lineHeight: 1.05 },
  { id: "permanent-marker", family: "Permanent Marker", files: [{ file: "permanent-marker-400-normal.woff", weight: 400, style: "normal" }], charWidth: 0.62, lineHeight: 1.15 },
  { id: "caveat", family: "Caveat", files: [{ file: "caveat-600-normal.woff", weight: 600, style: "normal" }], charWidth: 0.42, lineHeight: 1.1 },
  { id: "fredoka", family: "Fredoka", files: [{ file: "fredoka-700-normal.woff", weight: 700, style: "normal" }], charWidth: 0.56, lineHeight: 1.08 },
  { id: "homemade-apple", family: "Homemade Apple", files: [{ file: "homemade-apple-400-normal.woff", weight: 400, style: "normal" }], charWidth: 0.72, lineHeight: 1.55 },
  { id: "great-vibes", family: "Great Vibes", files: [{ file: "great-vibes-400-normal.woff", weight: 400, style: "normal" }], charWidth: 0.4, lineHeight: 1.2 },
  { id: "space-mono", family: "Space Mono", files: [{ file: "space-mono-400-normal.woff", weight: 400, style: "normal" }], charWidth: 0.6 },
];

export const FONT_IDS = FONTS.map((f) => f.id);
export const lineHeightOf = (id: string) => FONTS.find((f) => f.id === id)?.lineHeight ?? 1.05;
export const fontById = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[1];
