import fs from 'node:fs';

export type PlannedSocialPost = {
  id: string; title: string; format: string; brand: string; date: string;
  captions: Record<string, string>; sourceUrl: string; reviewStatus: string;
  body: string; issues: string[];
};
type PlanResult = { batchId: string | null; items: PlannedSocialPost[]; error: string | null };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}
function safeSource(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try { const url = new URL(v); return url.protocol === 'https:' && ['app.notion.com', 'notion.so', 'www.notion.so'].includes(url.hostname); }
  catch { return false; }
}

// Planning data has no account IDs, publisher state or delivery records.
// Reading a batch cannot schedule a post or write to the CRM.
export function readSocialPlan(file: string): PlanResult {
  if (!fs.existsSync(file)) return { batchId: null, items: [], error: null };
  try {
    const input: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!object(input) || input.version !== 1 || !text(input.batchId) || !Array.isArray(input.items) || input.items.length > 200) throw new Error('Invalid planning batch.');
    const ids = new Set<string>();
    const items: PlannedSocialPost[] = [];
    for (const row of input.items) {
      if (!object(row) || !text(row.id) || ids.has(row.id) || !text(row.title) || !text(row.format) || !text(row.brand) || !validDate(row.date) || !safeSource(row.sourceUrl) || !text(row.reviewStatus) || typeof row.body !== 'string' || !object(row.captions) || Object.values(row.captions).some(v => typeof v !== 'string') || !Array.isArray(row.issues) || row.issues.some(v => typeof v !== 'string')) throw new Error('Invalid or duplicate planning entry.');
      ids.add(row.id);
      items.push({ id: row.id, title: row.title, format: row.format, brand: row.brand, date: row.date, sourceUrl: row.sourceUrl, reviewStatus: row.reviewStatus, body: row.body, captions: row.captions as Record<string, string>, issues: row.issues as string[] });
    }
    return { batchId: input.batchId, items, error: null };
  } catch {
    return { batchId: null, items: [], error: 'The imported content plan could not be read. Re-import the validated planning file.' };
  }
}
