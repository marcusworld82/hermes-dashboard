import { LEAD_NOTION_SOURCES } from './notion-read-adapter.ts';
import crypto from 'node:crypto';
import type { LeadEmailSnapshot } from './mail-queue.ts';

export const DIRECT_NOTION_VERSION = '2026-03-11';
type Rich = { plain_text?: string; text?: { content?: string } };
function richText(item: Rich) { const value = item?.plain_text ?? item?.text?.content; if (typeof value !== 'string') throw Error('Notion draft text is incomplete.'); return value; }
type Prop = { id?: string; type?: string; rich_text?: Rich[]; email?: string | null; select?: { name: string } | null; status?: { name: string } | null; date?: { start?: string } | null; relation?: { id: string }[]; has_more?: boolean };
type NotionPage = { object?: string; id: string; archived?: boolean; in_trash?: boolean; last_edited_time: string; parent?: { data_source_id?: string }; properties: Record<string, Prop> };
export type DirectNotionConfig = { token: string; companiesDataSource: string; peopleDataSource: string; allowStageWrites?: boolean };
export type DirectLeadState = { id: string; email: string; stage: string; doNotContact: boolean; revision: string; subject?: string; body?: string };
const STAGES = ['New', 'Ready to send', 'Paused', 'Sent', 'Replied', 'Meeting', 'Client', 'Denied', 'Do not contact'];
function uuid(value: string) { const id = value.replaceAll('-', '').toLowerCase(); if (!/^[a-f0-9]{32}$/.test(id)) throw Error('Notion data source or page ID is invalid.'); return id; }
export function directNotionConfig(env = process.env): DirectNotionConfig {
  if (!env.NOTION_API_TOKEN) throw Error('NOTION_API_TOKEN is required for Mac-independent lead checks.');
  if (uuid(env.NOTION_COMPANIES_DATA_SOURCE_ID || '') !== uuid(LEAD_NOTION_SOURCES.companies) || uuid(env.NOTION_PEOPLE_DATA_SOURCE_ID || '') !== uuid(LEAD_NOTION_SOURCES.people)) throw Error('Host email sources must match the approved Lead Research master sources.');
  return { token: env.NOTION_API_TOKEN, companiesDataSource: uuid(env.NOTION_COMPANIES_DATA_SOURCE_ID || ''), peopleDataSource: uuid(env.NOTION_PEOPLE_DATA_SOURCE_ID || ''), allowStageWrites: env.HERMES_NOTION_STAGE_WRITES_APPROVED === 'true' };
}
function key(id: string) { const match = /^(companies|people):([a-f0-9]{32})$/.exec(id); if (!match) throw Error('Choose a lead from the approved Notion master list.'); return { kind: match[1] as 'companies' | 'people', id: match[2] }; }
function stage(page: NotionPage) {
  const property = page.properties.Stage;
  const value = property?.select?.name || property?.status?.name;
  if (!value || !STAGES.includes(value)) throw Error('Notion Stage is missing or unrecognized. Sending is blocked.');
  return value;
}
function suppressed(page: NotionPage) { return ['Denied', 'Do not contact'].includes(stage(page)) || page.properties['Outreach Status']?.select?.name === 'Do not contact' || page.properties['Outreach Status']?.status?.name === 'Do not contact'; }
function parseDraft(text: string) { const match = /^Subject:\s*([^\r\n]+)\r?\n+([\s\S]+)$/i.exec(text.trim()); if (!match) throw Error('Notion draft must contain Subject: on its first line and the message below.'); return { subject: match[1].trim(), body: match[2].trim() }; }
export function createDirectNotionMailAdapter(config: DirectNotionConfig, fetcher: typeof fetch = fetch) {
  const sources = { companies: uuid(config.companiesDataSource), people: uuid(config.peopleDataSource) };
  async function request<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
    let response: Response;
    try { response = await fetcher(`https://api.notion.com/v1/${endpoint}`, { method, headers: { Authorization: `Bearer ${config.token}`, 'Notion-Version': DIRECT_NOTION_VERSION, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw Error('Direct Notion request failed or timed out. Sending stays blocked.'); }
    if (!response.ok) throw Error(`Direct Notion request failed (HTTP ${response.status}). Check integration access.`);
    return response.json();
  }
  async function readPage(id: string, kind: 'companies' | 'people') {
    const page = await request<NotionPage>(`pages/${uuid(id)}`);
    if (page.object !== 'page' || uuid(page.id) !== uuid(id) || page.archived || page.in_trash || !page.last_edited_time || !page.properties || !page.parent?.data_source_id || uuid(page.parent.data_source_id) !== sources[kind]) throw Error('Notion page is unavailable or outside the approved data source.');
    return page;
  }
  async function text(page: NotionPage, name: string) {
    const prop = page.properties[name];
    if (!prop || prop.type !== 'rich_text' || !Array.isArray(prop.rich_text)) throw Error(`Notion ${name} property is missing or has the wrong type.`);
    if (prop.rich_text.length < 25) return prop.rich_text.map(richText).join('');
    if (!prop.id) throw Error('Notion draft is incomplete.');
    let cursor = '', result = '';
    const cursors = new Set<string>();
    for (let n = 0; n < 10; n++) {
      const query = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
      const part = await request<{ results?: { type?: string; rich_text?: Rich }[]; has_more?: boolean; next_cursor?: string | null }>(`pages/${uuid(page.id)}/properties/${encodeURIComponent(decodeURIComponent(prop.id))}?${query}`);
      if (!Array.isArray(part.results) || typeof part.has_more !== 'boolean') throw Error('Notion draft pagination was incomplete.');
      for (const item of part.results) { if (item.type !== 'rich_text' || !item.rich_text) throw Error('Unexpected Notion draft property response.'); result += richText(item.rich_text); }
      if (!part.has_more) return result;
      if (typeof part.next_cursor !== 'string' || !part.next_cursor || cursors.has(part.next_cursor)) throw Error('Notion draft pagination was incomplete.'); cursor = part.next_cursor; cursors.add(cursor);
    }
    throw Error('Notion draft exceeds the safe pagination limit.');
  }
  async function load(id: string) {
    const parsed = key(id), page = await readPage(parsed.id, parsed.kind);
    const parents: NotionPage[] = [];
    if (parsed.kind === 'people') {
      const relation = page.properties.Company;
      if (!relation || relation.type !== 'relation' || !Array.isArray(relation.relation) || relation.has_more || relation.relation.length > 25) throw Error('All parent companies must be readable before sending. Incomplete relations block release.');
      for (const parent of relation.relation) parents.push(await readPage(parent.id, 'companies'));
    }
    const email = page.properties[parsed.kind === 'companies' ? 'General Business Email' : 'Public Individual Business Email'];
    if (!email || email.type !== 'email' || typeof email.email !== 'string' || !email.email.trim()) throw Error('Notion does not contain a public business email.');
    const first = await text(page, 'Draft Email');
    const followup = page.properties['Draft Follow-up'] ? await text(page, 'Draft Follow-up') : '';
    const rawStage = stage(page), pauseUntil = page.properties['Pause Until']?.date?.start || '';
    const effectiveStage = rawStage === 'Paused' && pauseUntil && Number.isFinite(Date.parse(pauseUntil)) && Date.parse(pauseUntil) <= Date.now() ? 'New' : rawStage;
    const doNotContact = suppressed(page) || parents.some(suppressed);
    const revision = crypto.createHash('sha256').update(JSON.stringify({ id, email: email.email.trim().toLowerCase(), rawStage, pauseUntil, first, followup, edited: page.last_edited_time, parents: parents.map(parent => ({ id: parent.id, stage: stage(parent), suppressed: suppressed(parent), edited: parent.last_edited_time })) })).digest('hex');
    return { page, first, followup, state: { id, email: email.email.trim().toLowerCase(), stage: effectiveStage, doNotContact, revision } };
  }
  return {
    async snapshot(id: string): Promise<DirectLeadState> { return (await load(id)).state; },
    async email(id: string, kind: 'first' | 'followup' = 'first'): Promise<LeadEmailSnapshot> { const loaded = await load(id); return { ...loaded.state, ...parseDraft(kind === 'followup' ? loaded.followup : loaded.first) }; },
    async updateStage(id: string, expectedRevision: string, nextStage: string, bounce = false) {
      if (!config.allowStageWrites) throw Error('Host Notion stage writes await explicit deployment review. Delivery evidence remains saved in Outbox.');
      if (!['Sent', 'Replied', 'Paused', 'Do not contact'].includes(nextStage)) throw Error('Unsupported delivery stage.');
      const current = await load(id);
      if (current.state.revision !== expectedRevision || ['Denied', 'Do not contact', 'Meeting', 'Client', 'Paused'].includes(current.state.stage)) throw Error('Notion lead changed or has a protected stage. Review the delivery event.');
      // Notion has no conditional page-update API. Recheck immediately before changing
      // only Stage. A final read confirms the result; this is not a transaction lock.
      const recheck = await load(id);
      if (recheck.state.revision !== expectedRevision) throw Error('Notion changed during the delivery check. No update was sent.');
      const properties: Record<string, unknown> = { Stage: current.page.properties.Stage.type === 'status' ? { status: { name: nextStage } } : { select: { name: nextStage } } };
      if (bounce) { if (nextStage !== 'Paused' || !current.page.properties['Pause Until']) throw Error('Bounce pause requires the Pause Until property.'); properties['Pause Until'] = { date: null }; }
      await request(`pages/${key(id).id}`, 'PATCH', { properties });
      const confirmed = await readPage(key(id).id, key(id).kind);
      if (stage(confirmed) !== nextStage) throw Error('Notion did not confirm the delivery stage. Review the conflict.');
      return { ok: true };
    },
  };
}
