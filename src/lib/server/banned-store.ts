import { readJson, writeJson } from "./store.ts";
import { DEFAULT_BANNED } from "../carousel/banned.ts";

export const getBanned = () => readJson<string[]>("banned-phrases", DEFAULT_BANNED);
export function saveBanned(list: string[]) {
  const clean = [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter((s) => s && s.length <= 80))].slice(0, 300);
  writeJson("banned-phrases", clean);
  return clean;
}
