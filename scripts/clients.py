"""Notion Clients and Deliverables master. Explicit writes only, no messages or model calls."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
PARENT = '3ff8226e3aa58162ade0efdc927e9ee3'
STAGES = ['Onboarding', 'Sample', 'In production', 'Review', 'Delivered', 'Retainer', 'Paused']
STATUSES = ['Planned', 'In progress', 'Review', 'Delivered', 'Paused']
CLIENT_FIELDS = {'Name','Business','Contact','Email','Phone','Services','Price','Start Date','Stage','Notes','Next Action','Retainer Details','Links','Source Lead','Evidence','Client Key'}
DELIVERABLE_FIELDS = {'Name','Client','Due Date','Status','Notes','Links','Kanban Card ID','Deliverable Key'}
spec = importlib.util.spec_from_file_location('client_reader', ROOT / 'scripts/lead-research.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def data_dir():
    value = Path(os.environ.get('HERMES_DATA_DIR', ROOT / 'data'))
    value.mkdir(parents=True, exist_ok=True)
    return value


def save(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2))
    temp.chmod(0o600)
    temp.replace(path)


def page_id(value):
    found = re.findall(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32}', str(value), re.I)
    return found[-1].replace('-', '').lower() if found else ''


async def call(session, name, arguments):
    result = await session.call_tool(name, arguments)
    if result.is_error:
        raise RuntimeError('Notion did not confirm the client operation')
    value = json.loads(next(b.text for b in result.content if hasattr(b, 'text')))
    if value.get('type') == 'async_task' or 'async_task' in value:
        raise RuntimeError('Notion operation is pending. Refresh before retrying.')
    return value


async def schema(session, source):
    value = await call(session, 'notion-fetch', {'id': 'collection://' + source})
    match = re.search(r'<data-source-state>\s*(.*?)\s*</data-source-state>', value.get('text', ''), re.S)
    if not match:
        raise RuntimeError('Notion client schema could not be read')
    return json.loads(match[1])['schema']


def table_schema(kind, client_source=None):
    if kind == 'clients':
        return 'CREATE TABLE ("Name" TITLE, "Business" RICH_TEXT, "Contact" RICH_TEXT, "Email" EMAIL, "Phone" PHONE_NUMBER, "Services" RICH_TEXT, "Price" NUMBER FORMAT \'dollar\', "Start Date" DATE, "Stage" SELECT(' + ','.join("'"+s+"':default" for s in STAGES) + '), "Notes" RICH_TEXT, "Next Action" RICH_TEXT, "Retainer Details" RICH_TEXT, "Links" RICH_TEXT, "Source Lead" URL, "Evidence" RICH_TEXT, "Client Key" RICH_TEXT, "Files" FILES, "Last Edited" LAST_EDITED_TIME)'
    if not client_source or not re.fullmatch(r'[a-f0-9-]{32,36}', client_source):
        raise ValueError('Client source required')
    return 'CREATE TABLE ("Name" TITLE, "Client" RELATION(\'' + client_source + '\', DUAL \'Deliverables\'), "Due Date" DATE, "Status" SELECT(' + ','.join("'"+s+"':default" for s in STATUSES) + '), "Notes" RICH_TEXT, "Links" RICH_TEXT, "Kanban Card ID" RICH_TEXT, "Deliverable Key" RICH_TEXT, "Files" FILES, "Last Edited" LAST_EDITED_TIME)'


async def migrate(session):
    path = data_dir() / 'clients-sources.json'
    state = json.loads(path.read_text()) if path.exists() else {}
    parent = await call(session, 'notion-fetch', {'id': PARENT})
    text = parent.get('text', '')
    for kind, title in [('clients','Clients'),('deliverables','Deliverables')]:
        found = re.findall(r'<database\b([^>]*)>' + title + r'</database>', text)
        if len(found) > 1:
            raise RuntimeError('Duplicate client databases need review')
        if kind not in state and found:
            match = re.search(r'data-source-url="collection://([a-f0-9-]+)"', found[0])
            if not match:
                raise RuntimeError('Existing client database source could not be identified')
            state[kind] = match[1]
            state.pop('pending', None)
            save(path,state)
        if kind not in state:
            if state.get('pending'):
                raise RuntimeError('An earlier database create is uncertain. Check Notion before retrying.')
            state['pending'] = kind
            save(path,state)
            value = await call(session,'notion-create-database',{'parent':{'page_id':PARENT},'title':title,
                'schema':table_schema(kind,state.get('clients')),'description':'Client delivery workspace managed from Hermes. Nothing sends or starts agent work automatically.'})
            match = re.search(r'collection://([a-f0-9-]{36})',json.dumps(value))
            if not match:
                raise RuntimeError('Created source could not be confirmed. Check Notion.')
            state[kind] = match[1]
            state.pop('pending',None)
            save(path,state)
        current = await schema(session,state[kind])
        required = CLIENT_FIELDS if kind == 'clients' else DELIVERABLE_FIELDS
        if required - set(current):
            raise RuntimeError('Existing client schema is missing required fields. No fields were removed.')
    return {'ok':True,'sources':state}


async def read(session):
    path = data_dir() / 'clients-sources.json'
    if not path.exists():
        raise RuntimeError('Clients databases are not connected yet')
    sources = json.loads(path.read_text())
    if not sources.get('clients') or not sources.get('deliverables'):
        raise RuntimeError('Clients setup needs completion')
    rows = {kind:await reader.query_source(session,sources[kind]) for kind in ('clients','deliverables')}
    return {'ok':True,**rows,'sources':sources}


def validate_properties(kind, properties):
    allowed = CLIENT_FIELDS if kind == 'clients' else DELIVERABLE_FIELDS
    if not isinstance(properties,dict) or not properties:
        raise ValueError('Properties are required')
    for name,value in properties.items():
        prop = name[5:].split(':')[0] if name.startswith('date:') else name
        if prop not in allowed:
            raise ValueError('Unknown client property')
        if isinstance(value,str) and len(value)>20000:
            raise ValueError('Client field is too long')
    if 'Stage' in properties and properties['Stage'] not in STAGES:
        raise ValueError('Invalid client stage')
    if 'Status' in properties and properties['Status'] not in STATUSES:
        raise ValueError('Invalid deliverable status')


async def write(session,payload):
    kind=payload.get('kind')
    if kind not in ('clients','deliverables'):
        raise ValueError('Invalid client record type')
    props=payload.get('properties')
    validate_properties(kind,props)
    current=await read(session)
    ident=payload.get('id')
    if ident:
        if not re.fullmatch(r'[a-f0-9]{32}',ident):
            raise ValueError('Invalid record ID')
        rows=[r for r in current[kind] if page_id(r['url'])==ident]
        if len(rows)!=1:
            raise ValueError('Record no longer exists')
        if payload.get('expectedEdited') != rows[0].get('Last Edited',''):
            raise RuntimeError('Record changed in Notion. Refresh before saving.')
        await call(session,'notion-update-page',{'page_id':ident,'command':'update_properties','properties':props,'allow_async':False})
        return {'ok':True,'id':ident,'updated':True}
    key_name='Client Key' if kind=='clients' else 'Deliverable Key'
    key=props.get(key_name)
    if not isinstance(key,str) or not 1<=len(key)<=200 or not props.get('Name'):
        raise ValueError('Name and stable submission key are required')
    existing=[r for r in current[kind] if r.get(key_name)==key]
    if len(existing)>1:
        raise RuntimeError('Duplicate client keys need review')
    if existing:
        return {'ok':True,'id':page_id(existing[0]['url']),'existing':True}
    if kind=='deliverables':
        parents=props.get('Client',[])
        if not isinstance(parents,list) or len(parents)!=1 or page_id(parents[0]) not in [page_id(r['url']) for r in current['clients']]:
            raise ValueError('Choose an existing client')
    state_path=data_dir()/'clients-write-state.json'
    state=json.loads(state_path.read_text()) if state_path.exists() else {'uncertain':[]}
    if key in state['uncertain']:
        raise RuntimeError('An earlier create is uncertain. Refresh Notion before retrying.')
    state['uncertain'].append(key);save(state_path,state)
    await schema(session,current['sources'][kind])
    created=await call(session,'notion-create-pages',{'parent':{'data_source_id':current['sources'][kind]},'pages':[{'properties':props}],'allow_async':False})
    pages=created.get('pages',[])
    ident=page_id(pages[0].get('id') or pages[0].get('url')) if pages else ''
    if not ident:
        # Confirm through the master list rather than guessing the response shape.
        verified=await reader.query_source(session,current['sources'][kind])
        matches=[r for r in verified if r.get(key_name)==key]
        if len(matches)!=1:raise RuntimeError('Create is not yet visible; its key remains reserved')
        ident=page_id(matches[0]['url'])
    state['uncertain'].remove(key);save(state_path,state)
    return {'ok':True,'id':ident,'created':True}


async def main(payload):
    from hermes_cli.mcp_config import _get_mcp_servers,_resolve_mcp_server_config
    from tools.mcp_tool_discovery import _connect_server
    server=await _connect_server('notion',_resolve_mcp_server_config(_get_mcp_servers()['notion']))
    try:
        if payload.get('action')=='migrate':return await migrate(server.session)
        if payload.get('action')=='read':return await read(server.session)
        if payload.get('action')=='write':return await write(server.session,payload)
        raise ValueError('Unsupported client action')
    finally:await server.shutdown()


if __name__=='__main__':
    sys.path.insert(0,str(Path.home()/'.hermes/hermes-agent'))
    import hermes_bootstrap
    from tools.mcp_tool_loop import _ensure_mcp_loop,_run_on_mcp_loop
    from tools.mcp_tool_lifecycle import _stop_mcp_loop_if_idle
    try:
        payload=json.load(sys.stdin)
        with (data_dir()/'clients.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            _ensure_mcp_loop()
            print(json.dumps(_run_on_mcp_loop(main(payload),timeout=570)))
    except Exception:
        print(json.dumps({'ok':False,'error':'Notion did not confirm the client operation. Refresh before retrying. Existing data is preserved.'}))
    finally:_stop_mcp_loop_if_idle()
