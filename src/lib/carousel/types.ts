// Shared carousel model. Used by the server (storage, rendering, AI) and the Carousels page.

export type Size = "3:4" | "4:5";
export type Mode = "screenshot" | "creative" | "clone" | "photo" | "editorial";
export type Theme = "light" | "dark" | "brand";
export type SlideKind = "cover" | "body" | "cta";
export type Badge = "none" | "blue" | "gold";
export type Goal = "reach" | "trust" | "saves" | "sales" | "dms";

export const STRUCTURES = ["Listicle", "Storytelling", "Problem-Solution", "Myth vs Truth", "Old vs New", "Case Study Breakdown", "Framework/Matrix"] as const;
export type Structure = (typeof STRUCTURES)[number];

export const HOOK_FORMULAS = ["Stop doing X", "Nobody tells you X", "How to get X without Y", "I made X, here's what works"] as const;

export type Slide = {
  id: string;
  kind: SlideKind;
  layout: string;
  headline: string;
  body: string;
  images: string[];
  textScale: number;
  dim: number;
  showHandle: boolean;
};

export type CloneSpec = {
  bg: string;
  text: string;
  accent: string;
  displayFont: string;
  bodyFont: string;
  align: "left" | "center";
  headlineCase: "upper" | "title" | "sentence";
  imagePlacement: "none" | "full" | "bottom" | "top";
  notes: string;
};

export type Carousel = {
  id: string;
  brandId: string;
  mode: Mode;
  template: string;
  size: Size;
  theme: Theme;
  useBrandColors: boolean;
  title: string;
  inputs: {
    topic: string;
    steer: string;
    context: string;
    referenceUrl: string;
    referenceText: string;
    includeImages: boolean;
    goal: Goal;
    structure: Structure;
    slideCount: number;
    badge: Badge;
    output: "carousel" | "single";
  };
  ideas: string[];
  news: { title: string; url: string; summary: string }[];
  hooks: { text: string; formula: string }[];
  hook: string;
  slides: Slide[];
  caption: string;
  cover?: { image: string; source: "upload" | "marcus"; fit: "contain"; styleId?: number } | null;
  clone: { cover: string | null; inner: string[]; spec: CloneSpec | null };
  flags: string[];
  // Set when the carousel was started from a planned calendar entry.
  planId?: string;
  planDate?: string;
  status: "draft" | "scheduled" | "posted";
  createdAt: string;
  updatedAt: string;
};

export type BrandKit = {
  id: string;
  name: string;
  displayName: string;
  handle: string;
  avatar: string | null;
  badge: Badge;
  colors: { bg: string; text: string; accent: string };
  fonts: { display: string; body: string };
  ctaText: string;
  hashtags: string[];
};
