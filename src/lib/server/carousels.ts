import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { paths } from "./paths.ts";
import { newId } from "./store.ts";
import type { Carousel, Slide } from "../carousel/types.ts";

// Carousels live one file each in data/carousels/. Photos live in data/social-media/.

const dir = () => path.join(paths.data, "carousels");
const mediaDir = () => path.join(paths.data, "social-media");
const idOk = (id: string) => /^car_[a-f0-9]{10}$/.test(id);
const fileOf = (id: string) => {
  if (!idOk(id)) throw new Error("Unknown carousel.");
  return path.join(dir(), `${id}.json`);
};

function write(car: Carousel) {
  fs.mkdirSync(dir(), { recursive: true });
  const target = fileOf(car.id);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(car, null, 2));
  fs.renameSync(tmp, target);
}

export function newSlide(partial: Partial<Slide> = {}): Slide {
  return { id: newId("sl"), kind: "body", layout: "default", headline: "", body: "", images: [], textScale: 1, dim: 40, showHandle: true, ...partial };
}

export function createCarousel(partial: Partial<Carousel>): Carousel {
  const now = new Date().toISOString();
  const car: Carousel = {
    id: newId("car"), brandId: "lyfe", mode: "screenshot", template: "screenshot", size: "3:4", theme: "dark", useBrandColors: true, title: "",
    ideas: [], news: [], hooks: [], hook: "", slides: [], caption: "", clone: { cover: null, inner: [], spec: null }, flags: [], status: "draft",
    createdAt: now, updatedAt: now,
    ...partial,
    inputs: { topic: "", steer: "", context: "", referenceUrl: "", referenceText: "", includeImages: false, goal: "saves", structure: "Listicle", slideCount: 7, badge: "blue", output: "carousel", ...(partial.inputs ?? {}) },
  };
  write(car);
  return car;
}

export function getCarousel(id: string): Carousel {
  try { return JSON.parse(fs.readFileSync(fileOf(id), "utf8")) as Carousel; }
  catch (e) { if ((e as Error).message === "Unknown carousel.") throw e; throw new Error("Carousel not found."); }
}

export function listCarousels(): Carousel[] {
  let names: string[] = [];
  try { names = fs.readdirSync(dir()).filter((n) => n.endsWith(".json")); } catch { return []; }
  return names.flatMap((n) => { try { return [JSON.parse(fs.readFileSync(path.join(dir(), n), "utf8")) as Carousel]; } catch { return []; } })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function updateCarousel(id: string, patch: Partial<Carousel>): Carousel {
  const cur = getCarousel(id);
  const next: Carousel = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: new Date().toISOString(), inputs: { ...cur.inputs, ...(patch.inputs ?? {}) } };
  const n = next.inputs.slideCount;
  if (!Number.isInteger(n) || n < 3 || n > 10) throw new Error("Slide count must be 3 to 10.");
  if (next.slides.length > 10) throw new Error("A carousel can have up to 10 slides.");
  write(next);
  return next;
}

export function deleteCarousel(id: string) {
  fs.rmSync(fileOf(id), { force: true });
}

const MIME_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const magic = (b: Buffer, mime: string) =>
  mime === "image/png" ? b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  : mime === "image/jpeg" ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  : b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";

export function saveMedia(bytes: Buffer, mime: string, name: string): { file: string } {
  const ext = MIME_EXT[mime];
  if (!ext) throw new Error("Use JPG, PNG or WebP images.");
  if (bytes.length > 15 * 1024 * 1024) throw new Error("Images must be 15 MB or smaller.");
  if (!magic(bytes, mime)) throw new Error(`${name || "That file"} isn't a real ${ext.toUpperCase()} image.`);
  fs.mkdirSync(mediaDir(), { recursive: true });
  const file = `${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(mediaDir(), file), bytes);
  return { file };
}

export function readMedia(file: string): { bytes: Buffer; mime: string } {
  const m = /^[a-z0-9_-]+\.(png|jpg|webp)$/.exec(file);
  if (!m) throw new Error("Unknown image.");
  const mime = m[1] === "png" ? "image/png" : m[1] === "jpg" ? "image/jpeg" : "image/webp";
  try { return { bytes: fs.readFileSync(path.join(mediaDir(), file)), mime }; }
  catch { throw new Error("Unknown image."); }
}

export function listMedia(): string[] {
  try {
    return fs.readdirSync(mediaDir()).filter((f) => /^[a-z0-9_-]+\.(png|jpg|webp)$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(mediaDir(), f)).mtimeMs })).sort((a, b) => b.t - a.t).map((x) => x.f);
  } catch { return []; }
}
