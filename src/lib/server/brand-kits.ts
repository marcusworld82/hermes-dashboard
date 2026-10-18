import { readJson, writeJson } from "./store.ts";
import { LYFE } from "../carousel/brand.ts";
import type { BrandKit } from "../carousel/types.ts";

// Only Lyfe with Marcus for now; the file holds a list so more brands can be added later.
export function getBrandKits(): BrandKit[] {
  const saved = readJson<BrandKit[]>("brand-kits", []);
  return saved.length ? saved : [LYFE];
}

export function getBrandKit(id: string): BrandKit {
  return getBrandKits().find((k) => k.id === id) ?? getBrandKits()[0];
}

export function saveBrandKit(kit: BrandKit): BrandKit {
  const kits = getBrandKits().filter((k) => k.id !== kit.id);
  writeJson("brand-kits", [...kits, kit]);
  return kit;
}
