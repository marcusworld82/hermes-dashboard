// Server-only read transport. These are the existing Lead Research data sources.
export const LEAD_NOTION_SOURCES = {
  companies: 'e52e94bc-1536-4467-b595-80cafadf63fa',
  people: 'a814d082-803b-4f07-b69d-81afadd329cb',
  opportunities: 'db4cc901-64e1-407a-92bb-b8aa51c95925',
  evidence: '7ea54a55-a293-4ba4-96cd-e501416fd9f7',
  runLog: '9ce0dd98-b540-4277-9c2d-e2530e12388c',
} as const;
const VERSION = '2026-03-11';
type Row = Record<string, unknown>;
const object = (value: unknown): Row => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Incomplete Notion response'); return value as Row; };
const uuid = (value: unknown) => { if (typeof value !== 'string' || !/^[a-f0-9]{32}$/i.test(value.replaceAll('-', ''))) throw Error('Invalid Notion ID'); return value.replaceAll('-', '').toLowerCase(); };
function rich(value: unknown) { if (!Array.isArray(value)) throw Error('Incomplete Notion text'); return value.map(item => { const row = object(item); const content = row.plain_text ?? (row.text ? object(row.text).content : undefined); if (typeof content !== 'string') throw Error('Incomplete Notion text'); return content; }).join(''); }
export function normalizeNotionResearchPage(value: unknown): Row {
  const page = object(value), properties = object(page.properties);
  const row: Row = { id: uuid(page.id), url: `https://www.notion.so/${uuid(page.id)}`, createdTime: page.created_time, last_edited_time: page.last_edited_time };
  for (const [name, raw] of Object.entries(properties)) {
    const prop = object(raw), type = prop.type;
    if (type === 'title' || type === 'rich_text') row[name] = rich(prop[type]);
    else if (type === 'select' || type === 'status') row[name] = prop[type] == null ? '' : object(prop[type]).name;
    else if (type === 'multi_select') { if (!Array.isArray(prop.multi_select)) throw Error('Incomplete Notion tags'); row[name] = prop.multi_select.map(item => object(item).name); }
    else if (type === 'relation') { if (prop.has_more || !Array.isArray(prop.relation)) throw Error('Incomplete Notion relation'); row[name] = prop.relation.map(item => uuid(object(item).id)); }
    else if (type === 'date') row[`date:${name}:start`] = prop.date == null ? '' : object(prop.date).start;
    else if (['number', 'url', 'email', 'phone_number', 'checkbox', 'created_time', 'last_edited_time'].includes(String(type))) row[name] = prop[String(type)];
    // Other property types are not consumed by the existing research mapper.
  }
  return row;
}
export async function readNotionResearchDirect(options: { token?: string; fetcher?: typeof fetch } = {}): Promise<Row> {
  const token = options.token ?? process.env.NOTION_API_TOKEN;
  if (!token?.trim()) throw Error('notion_host_unconfigured');
  const fetcher = options.fetcher ?? fetch;
  async function request(endpoint: string, body?: Row): Promise<Row> {
    let response: Response;
    try { response = await fetcher(`https://api.notion.com/v1/${endpoint}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
    catch { throw Error('notion_host_read_failed'); }
    if (!response.ok) throw Error(response.status === 429 ? 'rate_limited' : 'notion_host_read_failed');
    try { return object(await response.json()); } catch { throw Error('notion_host_read_failed'); }
  }
  async function collect(get: (cursor?: string) => Promise<Row>): Promise<unknown[]> {
    const result: unknown[] = [], cursors = new Set<string>();
    let cursor: string | undefined;
    for (let i = 0; i < 100; i++) {
      const page = await get(cursor);
      if (page.object !== 'list' || !Array.isArray(page.results) || typeof page.has_more !== 'boolean') throw Error('Incomplete Notion pagination');
      result.push(...page.results);
      if (result.length > 10_000) throw Error('Notion read limit exceeded');
      if (!page.has_more) return result;
      if (typeof page.next_cursor !== 'string' || !page.next_cursor || cursors.has(page.next_cursor)) throw Error('Incomplete Notion pagination');
      cursor = page.next_cursor; cursors.add(cursor);
    }
    throw Error('Notion read limit exceeded');
  }
  const result: Row = { ok: true };
  for (const [key, source] of Object.entries(LEAD_NOTION_SOURCES)) {
    const pages = await collect(cursor => request(`data_sources/${source}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }));
    const ids = new Set<string>(), rows: Row[] = [];
    for (const raw of pages) {
      const page = object(raw), id = uuid(page.id);
      if (page.object !== 'page' || page.archived || page.in_trash || uuid(object(page.parent).data_source_id) !== uuid(source) || ids.has(id)) throw Error('Invalid Notion research page');
      ids.add(id);
      const properties = object(page.properties);
      for (const propRaw of Object.values(properties)) {
        const prop = object(propRaw), type = String(prop.type), values = prop[type];
        if ((type === 'relation' && prop.has_more) || (['title', 'rich_text'].includes(type) && Array.isArray(values) && values.length >= 25)) {
          if (typeof prop.id !== 'string' || !prop.id) throw Error('Incomplete Notion property');
          const parts = await collect(cursor => request(`pages/${id}/properties/${encodeURIComponent(decodeURIComponent(prop.id as string))}?${new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) })}`));
          prop[type] = parts.map(part => { const item = object(part); if (item.type !== type || !item[type]) throw Error('Incomplete Notion property'); return item[type]; });
          prop.has_more = false;
        }
      }
      rows.push(normalizeNotionResearchPage(page));
    }
    result[key] = rows;
  }
  return result;
}
