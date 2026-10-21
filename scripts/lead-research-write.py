"""Explicit master-list operations. Never sends messages or starts discovery."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
PROJECT = Path.home() / 'Desktop/LYFE WITH MARCUS/AI Content Business/lead-research'
sys.path.insert(0, str(PROJECT / 'src'))
from leadresearch.notion_schema import SCHEMA, DATA_SOURCES, TITLE_PROP
from leadresearch.notion_map import FIELD_MAP, RELATION_FIELDS, to_properties
from leadresearch.matching import merge_record
spec = importlib.util.spec_from_file_location('lead_read', ROOT / 'scripts/lead-research.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
EDITABLE = {'Stage', 'Draft Email', 'Draft DM', 'Draft Call Script', 'Draft Follow-up', 'Denial Reason', 'date:Pause Until:start', 'date:Pause Until:is_datetime'}
ADDITIONS = ['Why Tags', 'Reason', 'Owner or Decision Maker', 'Lead Origin', 'TikTok', 'YouTube', 'X', 'Draft Email', 'Draft DM', 'Draft Call Script', 'Draft Follow-up', 'Pause Until', 'Denial Reason', 'Stage', 'Score Parts']
UUID = re.compile(r'^[a-f0-9]{32}$')


def page_id(value):
    matches = re.findall(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32}', str(value), re.I)
    return matches[-1].replace('-', '').lower() if matches else ''


def links(value):
    return list(dict.fromkeys(m.replace('-', '').lower() for m in re.findall(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32}', json.dumps(value or ''), re.I)))


def sql_properties(db, record):
    """Validate with the shared mapper, then preserve full text for MCP SQLite values."""
    to_properties(db, record)
    out = {}
    for key, value in record.items():
        if value is None or value == '' or value == []:
            continue
        prop = FIELD_MAP[db].get(key) or RELATION_FIELDS[db].get(key)
        kind = SCHEMA[db][prop][0]
        if kind == 'date':
            out[f'date:{prop}:start'] = value
            out[f'date:{prop}:is_datetime'] = int(len(str(value)) > 10)
        elif kind == 'multi_select':
            out[prop] = json.dumps(value if isinstance(value, list) else [value])
        elif kind == 'number':
            out[prop] = float(value)
        else:
            out[prop] = value
    return out


def internal_record(db, row):
    out = {}
    for key, prop in FIELD_MAP[db].items():
        kind = SCHEMA[db][prop][0]
        value = row.get(f'date:{prop}:start') if kind == 'date' else row.get(prop)
        if kind == 'multi_select' and isinstance(value, str):
            try:
                value = json.loads(value)
            except ValueError:
                value = [s.strip() for s in value.split(',') if s.strip()]
        out[key] = value
    return out


def identity_keys(db, record):
    keys = set()
    for kind, field in [('domain', 'root_domain'), ('email', 'general_email'), ('phone', 'general_phone'), ('linkedin', 'linkedin_company_url')] if db == 'companies' else [('email', 'individual_email'), ('phone', 'individual_phone'), ('linkedin', 'linkedin_profile_url')]:
        value = str(record.get(field) or '').strip().lower()
        if kind == 'phone':
            value = re.sub(r'\D', '', value)
            if len(value) == 11 and value.startswith('1'):
                value = value[1:]
        if value:
            keys.add((kind, value.rstrip('/')))
    return keys


async def call(session, name, args):
    result = await session.call_tool(name, args)
    if result.is_error:
        raise RuntimeError('Notion operation failed')
    value = json.loads(next(b.text for b in result.content if hasattr(b, 'text')))
    if value.get('type') == 'async_task' or 'async_task' in value:
        raise RuntimeError('Notion write is pending. Refresh before retrying.')
    return value


async def fetch_schema(session, db):
    value = await call(session, 'notion-fetch', {'id': 'collection://' + DATA_SOURCES[db]})
    text = value.get('text', '')
    state = re.search(r'<data-source-state>\s*(.*?)\s*</data-source-state>', text, re.S)
    if not state:
        raise RuntimeError('Missing database schema')
    return json.loads(state[1])['schema']


async def migrate(session):
    added = {}
    for db in ['companies', 'people']:
        current = await fetch_schema(session, db)
        statements = []
        names = []
        for prop in ADDITIONS + ['Last Edited']:
            if prop in current:
                continue
            if prop == 'Last Edited':
                ddl = 'LAST_EDITED_TIME'
            else:
                kind, opts = SCHEMA[db][prop]
                ddl = {'rich_text': 'RICH_TEXT', 'url': 'URL', 'date': 'DATE'}.get(kind)
                if kind in ['select', 'multi_select']:
                    ddl = kind.upper() + '(' + ', '.join("'" + opt.replace("'", "''") + "':default" for opt in opts) + ')'
            if not ddl:
                raise RuntimeError('Unsupported additive migration')
            statements.append('ADD COLUMN "' + prop + '" ' + ddl)
            names.append(prop)
        if statements:
            await call(session, 'notion-update-data-source', {'data_source_id': DATA_SOURCES[db], 'statements': '; '.join(statements)})
        verified = await fetch_schema(session, db)
        if any(prop not in verified for prop in ADDITIONS + ['Last Edited']):
            raise RuntimeError('Schema migration not yet verified')
        added[db] = names
    return {'ok': True, 'added': added}


async def find_row(session, db, ident):
    table = 'collection://' + DATA_SOURCES[db]
    # IDs are validated, and queries are confined to the two approved lead sources.
    value = await call(session, 'notion-query-data-sources', {'data': {'mode': 'sql', 'data_source_urls': [table], 'query': f'SELECT * FROM "{table}" WHERE replace(url, \'-\', \'\') LIKE ? LIMIT 2', 'params': ['%' + ident + '%']}})
    rows = value.get('results')
    if not isinstance(rows, list) or len(rows) > 1:
        raise RuntimeError('Ambiguous lead')
    return reader.plain(rows[0]) if rows else None


async def snapshot(session, db, ident):
    if db not in ['companies', 'people'] or not UUID.fullmatch(ident):
        raise ValueError('Invalid lead ID')
    row = await find_row(session, db, ident)
    if not row:
        raise RuntimeError('Lead no longer exists in the master list')
    parents = []
    if db == 'people':
        for parent in links(row.get('Company')):
            company = await find_row(session, 'companies', parent)
            if not company:
                raise RuntimeError('Linked company could not be checked')
            parents.append(company)
    return {'ok': True, 'db': db, 'row': row, 'parents': parents}


async def update(session, payload):
    db, ident = payload.get('db'), payload.get('id')
    current = await snapshot(session, db, ident)
    expected = payload.get('expected')
    if not isinstance(expected, dict) or any(current['row'].get(k) != v for k, v in expected.items()):
        raise RuntimeError('Lead changed in Notion. Refresh and review it again.')
    props = payload.get('properties')
    if not isinstance(props, dict) or not props or set(props) - EDITABLE:
        raise ValueError('Unsupported lead change')
    if 'Stage' in props:
        if props['Stage'] not in SCHEMA[db]['Stage'][1]:
            raise ValueError('Invalid lead stage')
        if current['row'].get('Stage') in ['Denied', 'Do not contact'] and props['Stage'] != current['row'].get('Stage'):
            raise ValueError('Denied and Do not contact leads stay suppressed')
    if any((not (k == 'date:Pause Until:start' and v is None) and k != 'date:Pause Until:is_datetime' and (not isinstance(v, str) or len(v) > 20000)) or (k == 'date:Pause Until:is_datetime' and v != 1) for k, v in props.items()):
        raise ValueError('Invalid draft')
    await call(session, 'notion-update-page', {'page_id': ident, 'command': 'update_properties', 'properties': props, 'allow_async': False})
    checked = await snapshot(session, db, ident)
    if any(checked['row'].get(k) != v for k, v in props.items()):
        raise RuntimeError('Saved change is not yet visible. Refresh before retrying.')
    return checked


async def sync(session, payload):
    records = payload.get('records')
    if not isinstance(records, dict) or set(records) - set(DATA_SOURCES):
        raise ValueError('Invalid record groups')
    # Read every master source before any writes, so source failures cannot create duplicates.
    existing = {db: await reader.query_source(session, source) for db, source in DATA_SOURCES.items()}
    state_path = Path(os.environ.get('HERMES_DATA_DIR', ROOT / 'data')) / 'lead-research-write-state.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {'uncertain': [], 'known': {}}
    state.setdefault('known', {})
    state.setdefault('conflicts', [])
    def save():
        tmp = state_path.with_suffix('.tmp')
        tmp.write_text(json.dumps(state))
        tmp.chmod(0o600)
        tmp.replace(state_path)
    id_map = {}
    for db, rows in existing.items():
        for row in rows:
            sid = row.get('Stable ID')
            if sid:
                if sid in id_map:
                    raise RuntimeError('Duplicate stable IDs require review')
                id_map[sid] = page_id(row['url'])
    created = updated = conflicts = 0
    relation_work = []
    protected = {'stage', 'outreach_status', 'draft_email', 'draft_dm', 'draft_call_script', 'draft_followup', 'pause_until', 'denial_reason', 'first_found'}
    for db in DATA_SOURCES:
        batch = records.get(db, [])
        if not isinstance(batch, list) or len(batch) > 500:
            raise ValueError('Invalid record batch')
        for incoming in batch:
            rec = {k: v for k, v in incoming.items() if k != '_relations'}
            sid = rec.get('stable_id')
            if db == 'run_log':
                # Existing Run Log has no Stable ID; Run IDs identify the approved cloud run.
                sid = 'run:' + str(rec.get('run_ids') or '')
                if sid == 'run:':
                    raise ValueError('Run log needs cloud run IDs')
            elif not sid:
                raise ValueError('A stable ID is required')
            candidates = [r for r in existing[db] if r.get('Stable ID') == sid or (db == 'run_log' and r.get('Run IDs') == rec.get('run_ids'))]
            if db in ['companies', 'people'] and not candidates:
                incoming_keys = identity_keys(db, rec)
                candidates = [r for r in existing[db] if incoming_keys & identity_keys(db, internal_record(db, r))]
            if len(candidates) > 1:
                raise RuntimeError('Conflicting contact identities require review')
            if candidates:
                row = candidates[0]
                ident = page_id(row['url'])
                id_map[sid] = ident
                state['known'][sid] = ident
                state['uncertain'] = [s for s in state['uncertain'] if s != sid]
                old = internal_record(db, row)
                plan = merge_record(old, {k: v for k, v in rec.items() if k not in protected and k != 'stable_id'})
                conflicts += len(plan['conflicts'])
                if plan['conflicts']:
                    state['conflicts'].append({'stableId': sid, 'fields': plan['conflicts']})
                    state['conflicts'] = state['conflicts'][-200:]
                changed = {k: plan['merged'][k] for k in plan['changed']}
                if changed:
                    changed[TITLE_PROP[db].lower().replace(' ', '_') if db == 'run_log' else 'title' if db == 'evidence' else 'name'] = old.get('run_name' if db == 'run_log' else 'title' if db == 'evidence' else 'name')
                    props = sql_properties(db, changed)
                    props.pop(TITLE_PROP[db], None)
                    if props:
                        await call(session, 'notion-update-page', {'page_id': ident, 'command': 'update_properties', 'properties': props, 'allow_async': False})
                        row.update(props)
                        updated += 1
            else:
                if sid in state['known']:
                    raise RuntimeError('Known page is missing or archived. Do not recreate it automatically.')
                if sid in state['uncertain']:
                    raise RuntimeError('An earlier create needs reconciliation before retrying')
                props = sql_properties(db, rec)
                state['uncertain'].append(sid)
                save()
                result = await call(session, 'notion-create-pages', {'parent': {'data_source_id': DATA_SOURCES[db]}, 'allow_async': False, 'pages': [{'properties': props}]})
                pages = result.get('pages') or result.get('results') or []
                ident = page_id(pages[0].get('url') or pages[0].get('id')) if pages else ''
                if not ident:
                    # Reconcile from the master, never guess whether a write happened.
                    check = await reader.query_source(session, DATA_SOURCES[db])
                    found = [r for r in check if r.get('Stable ID') == sid or (db == 'run_log' and r.get('Run IDs') == rec.get('run_ids'))]
                    if len(found) != 1:
                        raise RuntimeError('New page is not yet visible. Refresh before retrying.')
                    ident = page_id(found[0]['url'])
                id_map[sid] = ident
                state['known'][sid] = ident
                existing[db].append({**props, 'url': 'https://www.notion.so/' + ident})
                state['uncertain'].remove(sid)
                save()
                created += 1
            relation_work.append((db, id_map[sid], incoming.get('_relations', {})))
    # Relations use stable IDs until every referenced page has a real Notion ID.
    for db, ident, relations in relation_work:
        props = {}
        row = next(r for r in existing[db] if page_id(r['url']) == ident)
        for field, stable_ids in relations.items():
            prop = RELATION_FIELDS.get(db, {}).get(field)
            if not prop or any(s not in id_map for s in stable_ids):
                raise RuntimeError('Unresolved relationship')
            props[prop] = list(dict.fromkeys(links(row.get(prop)) + [id_map[s] for s in stable_ids]))
        if props:
            await call(session, 'notion-update-page', {'page_id': ident, 'command': 'update_properties', 'properties': props, 'allow_async': False})
    save()
    return {'ok': True, 'created': created, 'updated': updated, 'conflicts': conflicts}


async def main(payload):
    from hermes_cli.mcp_config import _get_mcp_servers, _resolve_mcp_server_config
    from tools.mcp_tool_discovery import _connect_server
    server = await _connect_server('notion', _resolve_mcp_server_config(_get_mcp_servers()['notion']))
    try:
        action = payload.get('action')
        if action == 'preflight':
            for db in ['companies', 'people']:
                schema = await fetch_schema(server.session, db)
                if any(prop not in schema for prop in ADDITIONS + ['Last Edited']):
                    raise RuntimeError('Lead schema migration is required before discovery')
            return {'ok': True}
        if action == 'migrate':
            return await migrate(server.session)
        if action == 'snapshot':
            return await snapshot(server.session, payload.get('db'), payload.get('id'))
        if action == 'update':
            return await update(server.session, payload)
        if action == 'sync':
            return await sync(server.session, payload)
        raise ValueError('Unsupported action')
    finally:
        await server.shutdown()


if __name__ == '__main__':
    sys.path.insert(0, str(Path.home() / '.hermes/hermes-agent'))
    import hermes_bootstrap
    from tools.mcp_tool_loop import _ensure_mcp_loop, _run_on_mcp_loop
    from tools.mcp_tool_lifecycle import _stop_mcp_loop_if_idle
    data_dir = Path(os.environ.get('HERMES_DATA_DIR', ROOT / 'data'))
    data_dir.mkdir(parents=True, exist_ok=True)
    try:
        payload = json.load(sys.stdin)
        with (data_dir / 'lead-research-write.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            _ensure_mcp_loop()
            print(json.dumps(_run_on_mcp_loop(main(payload), timeout=570)))
    except Exception:
        print(json.dumps({'ok': False, 'error': 'Notion did not confirm this operation. Refresh the lead before retrying. Existing data is preserved; an uncertain create is blocked from automatic retry.'}))
    finally:
        _stop_mcp_loop_if_idle()
