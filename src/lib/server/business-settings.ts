import { readJson, writeJson } from "./store.ts";

export const sourceTypes = ["subreddit", "reddit-search", "youtube", "x", "instagram", "website", "rss", "newsletter"] as const;
export type ResearchSource = { id: string; type: typeof sourceTypes[number]; value: string; enabled: boolean; notes: string };
export type BusinessSettings = {
  automaticMorningRun: boolean; senderEnabled: boolean; dailyScrapeCapUsd: number;
  dailyEmailLimit: number; weekendSending: boolean;
  hotThreshold: number; warmThreshold: number;
  services: string; niche: string; location: string; portfolioUrl: string;
  senderName: string; businessName: string; signature: string; postalAddress: string;
  sources: ResearchSource[];
};
export const businessDefaults: BusinessSettings = {
  automaticMorningRun: false, senderEnabled: false, dailyScrapeCapUsd: 0.50, dailyEmailLimit: 20, weekendSending: false,
  hotThreshold: 70, warmThreshold: 45, services: "", niche: "", location: "",
  portfolioUrl: "", senderName: "Marcus Collins", businessName: "", signature: "", postalAddress: "", sources: [],
};
export function getBusinessSettings(): BusinessSettings {
  return { ...businessDefaults, ...readJson<Partial<BusinessSettings>>("business-settings", {}) };
}
function publicUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw Error("Enter a public HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") ||
      /(^localhost$|\.local$|^[\d.]+$|:)/i.test(url.hostname)) throw Error("Enter a public HTTPS URL.");
  return url.href;
}
export function saveBusinessSettings(patch: Partial<BusinessSettings>): BusinessSettings {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw Error("Send settings as an object.");
  const allowed = new Set(Object.keys(businessDefaults));
  for (const key of Object.keys(patch)) if (!allowed.has(key)) throw Error(`Unknown setting: ${key}`);
  const s = {...getBusinessSettings(), ...patch};
  for (const field of ["automaticMorningRun", "senderEnabled", "weekendSending"] as const) if (typeof s[field] !== "boolean") throw Error(`${field} must be a boolean.`);
  if (!Number.isFinite(s.dailyScrapeCapUsd) || s.dailyScrapeCapUsd < 0 || s.dailyScrapeCapUsd > .5) throw Error("The scrape cap must be between $0 and $0.50.");
  if (!Number.isInteger(s.dailyEmailLimit) || s.dailyEmailLimit < 1 || s.dailyEmailLimit > 30) throw Error("Choose 1 to 30 emails per day.");
  if (![s.hotThreshold,s.warmThreshold].every(n=>Number.isInteger(n)&&n>=0&&n<=100) || s.hotThreshold<=s.warmThreshold) throw Error("Hot threshold must be above Warm threshold, both between 0 and 100.");
  for (const field of ["services","niche","location","portfolioUrl","senderName","businessName","signature","postalAddress"] as const) {
    if (typeof s[field] !== "string" || s[field].length > 4000) throw Error(`Invalid ${field}.`);
    s[field] = s[field].trim();
  }
  if (s.portfolioUrl) publicUrl(s.portfolioUrl);
  if (!Array.isArray(s.sources) || s.sources.length > 100) throw Error("Use at most 100 sources.");
  const ids = new Set<string>();
  s.sources = s.sources.map(source => {
    if (!source || !/^[a-zA-Z0-9_-]{1,80}$/.test(source.id) || ids.has(source.id)) throw Error("Each source needs a unique ID.");
    ids.add(source.id);
    if (!sourceTypes.includes(source.type) || typeof source.enabled !== "boolean" || typeof source.value !== "string" || !source.value.trim() || source.value.length > 2000 || typeof source.notes !== "string" || source.notes.length > 4000) throw Error("Invalid research source.");
    if (["youtube","website","rss","newsletter"].includes(source.type)) publicUrl(source.value);
    return {id: source.id, type: source.type, value: source.value.trim(), enabled: source.enabled, notes: source.notes.trim()};
  });
  writeJson("business-settings",s);
  return s;
}
