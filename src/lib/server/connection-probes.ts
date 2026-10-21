import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { paths } from './paths.ts';
import { readJson, writeJson } from './store.ts';
import { dotenvValue } from './models.ts';

export const MCP_PROBES = ['notion', 'bigin', 'supabase', 'vercel'] as const;
export type ProbeEvidence = { ok: boolean; checkedAt: number; detail?: string; error?: string; cost?: number | null };
export type ProbeStore = Record<string, ProbeEvidence>;
const exec = promisify(execFile);
const pending = new Map<string, Promise<ProbeEvidence>>();

export function savedProbes() { return readJson<ProbeStore>('connection-probes', {}); }
function save(id: string, result: ProbeEvidence) {
  writeJson('connection-probes', { ...savedProbes(), [id]: result });
  return result;
}
export async function runMcpProbe(id: string) {
  if (!MCP_PROBES.includes(id as typeof MCP_PROBES[number])) throw Error('Unsupported connection.');
  if (pending.has(id)) return pending.get(id)!;
  const promise = (async () => {
    let result: ProbeEvidence;
    try {
      const runtime = await exec(paths.hermesBin, ['--print-runtime-command'], { timeout: 10000 });
      const [python] = JSON.parse(runtime.stdout);
      const out = await exec(python, ['-I', path.join(process.cwd(), 'scripts/connection-probe.py'), id], { timeout: 50000, maxBuffer: 100000 });
      const parsed = JSON.parse(out.stdout.trim().split('\n').at(-1)!);
      result = { ok: parsed.ok === true, checkedAt: Date.now(), ...(parsed.ok === true ? { detail: String(parsed.detail) } : { error: String(parsed.error || 'MCP check failed.') }) };
    } catch {
      result = { ok: false, checkedAt: Date.now(), error: 'MCP runtime failed or timed out. Check the Marcus OS installation and sign-in.' };
    }
    return save(id, result);
  })();
  pending.set(id, promise);
  try { return await promise; } finally { pending.delete(id); }
}

// Fixed model and token limit. A quote is read-only; only POST executes a generation.
export const CHECK_MODEL = 'openai/gpt-4o-mini';
export type CheckQuote = { model: string; estimatedMaxCost: number; expiresAt: number; promptPrice: number; completionPrice: number };
let currentQuote: CheckQuote | null = null;
function key() {
  let text = '';
  try { text = fs.readFileSync(path.join(paths.hermesHome, '.env'), 'utf8'); } catch {}
  return process.env.OPENROUTER_API_KEY || dotenvValue(text, 'OPENROUTER_API_KEY') || '';
}
export async function quoteOpenRouter(fetcher: typeof fetch = fetch): Promise<CheckQuote> {
  const response = await fetcher('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error(`OpenRouter pricing request failed (HTTP ${response.status}).`);
  const body = await response.json();
  const model = body.data?.find((m: { id: string }) => m.id === CHECK_MODEL);
  const promptPrice = Number(model?.pricing?.prompt), completionPrice = Number(model?.pricing?.completion);
  if (!Number.isFinite(promptPrice) || !Number.isFinite(completionPrice) || promptPrice < 0 || completionPrice < 0) throw Error('OpenRouter did not return usable model pricing.');
  // 256 input tokens covers the fixed tiny prompt plus message overhead.
  const estimatedMaxCost = promptPrice * 256 + completionPrice * 8 + Number(model?.pricing?.request || 0);
  if (!Number.isFinite(estimatedMaxCost) || estimatedMaxCost > 0.01) throw Error('Check estimate exceeds the $0.01 safety limit.');
  currentQuote = { model: CHECK_MODEL, estimatedMaxCost, expiresAt: Date.now() + 60000, promptPrice, completionPrice };
  return currentQuote;
}
export async function generateOpenRouter(quote: CheckQuote, apiKey: string, fetcher: typeof fetch = fetch): Promise<ProbeEvidence> {
  if (!apiKey) throw Error('OpenRouter credential is missing.');
  const response = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: CHECK_MODEL, messages: [{ role: 'user', content: 'Reply OK.' }], max_tokens: 8, stream: false, usage: { include: true }, provider: { max_price: { prompt: quote.promptPrice * 1000000, completion: quote.completionPrice * 1000000 } } }),
  });
  if (!response.ok) return { ok: false, checkedAt: Date.now(), error: `OpenRouter generation failed (HTTP ${response.status}).` };
  const body = await response.json();
  const ok = typeof body.choices?.[0]?.message?.content === 'string' && body.choices[0].message.content.trim().length > 0 && !body.error;
  return { ok, checkedAt: Date.now(), cost: typeof body.usage?.cost === 'number' ? body.usage.cost : null, ...(ok ? { detail: 'Live generation returned a reply.' } : { error: 'OpenRouter returned no reply. A charge is still possible.' }) };
}
export async function runOpenRouterCheck(approvedCost: unknown) {
  if (pending.has('openrouter')) throw Error('An OpenRouter check is already running.');
  const quote = currentQuote;
  if (!quote || quote.expiresAt < Date.now() || approvedCost !== quote.estimatedMaxCost) throw Error('Review a fresh cost estimate before running the check.');
  currentQuote = null;
  const promise = (async () => {
    try { return save('openrouter', await generateOpenRouter(quote, key())); }
    catch { return save('openrouter', { ok: false, checkedAt: Date.now(), error: 'OpenRouter check failed or timed out. Billing could not be confirmed. Review usage before retrying.' }); }
  })();
  pending.set('openrouter', promise);
  try { return await promise; } finally { pending.delete('openrouter'); }
}
