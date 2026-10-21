import { approveEmail, exactEmailDraft, type LeadEmailResolver, type MailBusinessSettings } from './mail-queue.ts';
import type { MailStore } from './mail-queue-store.ts';

type Kind = 'first' | 'followup';
export type BulkPreviewRow = { id: string; kind: Kind; email?: string; subject?: string; body?: string; draftHash?: string; error?: string };
export type BulkApprovalRow = { id: string; queued: boolean; queueId?: string; error?: string };
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > 30) throw Error('Choose 1 to 30 emails.');
  return value;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^(companies|people):[a-f0-9]{32}$/.test(value)) throw Error('Choose leads from the master list.');
  return value;
}
function kind(value: unknown): Kind {
  if (value === undefined || value === 'first') return 'first';
  if (value === 'followup') return value;
  throw Error('Choose first email or follow-up.');
}
function unique(ids: string[]) { if (new Set(ids).size !== ids.length) throw Error('Each lead can appear only once.'); }
const message = (error: unknown) => error instanceof Error ? error.message : 'This email could not be checked.';
export async function previewBulkEmail(store: MailStore, resolve: LeadEmailResolver, settings: MailBusinessSettings, ids: unknown, emailKind?: unknown): Promise<{ rows: BulkPreviewRow[] }> {
  const selected = list(ids).map(id), step = kind(emailKind); unique(selected);
  // Run the exact queue checks on a detached copy. This also catches duplicate recipients within this preview.
  let state = structuredClone(store.read());
  const dryStore: MailStore = { read: () => structuredClone(state), close() {}, transaction(fn) { const next = structuredClone(state); const result = fn(next); state = next; return result; } };
  const rows: BulkPreviewRow[] = [];
  for (const leadId of selected) {
    try {
      const lead = await resolve(leadId, step);
      if (lead.id !== leadId) throw Error('The resolved lead does not match the selected lead.');
      const draft = exactEmailDraft(lead, settings);
      approveEmail(dryStore, lead, settings, draft.draftHash, step);
      rows.push({ id: leadId, kind: step, ...draft });
    } catch (error) { rows.push({ id: leadId, kind: step, error: message(error) }); }
  }
  return { rows };
}
export async function approveBulkEmail(store: MailStore, resolve: LeadEmailResolver, settings: MailBusinessSettings, items: unknown, reviewedAll: unknown): Promise<{ rows: BulkApprovalRow[]; queued: number; failed: number }> {
  if (reviewedAll !== true) throw Error('Confirm that you reviewed every complete email.');
  const selected = list(items).map(value => {
    if (!value || typeof value !== 'object') throw Error('Review each exact email first.');
    const row = value as Record<string, unknown>;
    if (typeof row.approvedHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.approvedHash)) throw Error('Review each exact email first.');
    return { id: id(row.id), kind: kind(row.kind), approvedHash: row.approvedHash };
  });
  unique(selected.map(row => row.id));
  const rows: BulkApprovalRow[] = [];
  for (const row of selected) {
    try {
      const lead = await resolve(row.id, row.kind);
      if (lead.id !== row.id) throw Error('The resolved lead does not match the selected lead.');
      const queued = approveEmail(store, lead, settings, row.approvedHash, row.kind);
      rows.push({ id: row.id, queued: true, queueId: queued.id });
    } catch (error) { rows.push({ id: row.id, queued: false, error: message(error) }); }
  }
  return { rows, queued: rows.filter(row => row.queued).length, failed: rows.filter(row => !row.queued).length };
}
