"""Read the approved Notion lead library, with fixed-source SQL pagination."""
import json,sys,asyncio
from pathlib import Path
sys.path.insert(0,str(Path.home()/'.hermes/hermes-agent'))
import hermes_bootstrap
from hermes_cli.mcp_config import _get_mcp_servers,_resolve_mcp_server_config
from tools.mcp_tool_loop import _ensure_mcp_loop,_run_on_mcp_loop
from tools.mcp_tool_discovery import _connect_server
from tools.mcp_tool_lifecycle import _stop_mcp_loop_if_idle
source='collection://83353f62-e55b-467c-aea1-28cdbeaa19e1'
import re
payload=json.load(sys.stdin)
state_file=Path(__file__).resolve().parent.parent/'data/outreach-notion-receipts.json'
state=json.loads(state_file.read_text()) if state_file.exists() else {'known':[],'uncertain':[]}
def save_state():
 state_file.parent.mkdir(parents=True,exist_ok=True)
 temporary=state_file.with_suffix('.tmp');temporary.write_text(json.dumps(state));temporary.chmod(0o600);temporary.replace(state_file)


import re,html
def plain(value):
 if not isinstance(value,str):return value
 value=re.sub(r'<br\s*/?>','\n',value)
 value=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',lambda m:m.group(1) if m.group(1)==m.group(2) else m.group(1)+' ('+m.group(2)+')',value)
 return html.unescape(re.sub(r'\\([\\`*{}\[\]()#+\-.!_|>])',r'\1',value))
def plain_rows(rows):return [{k:plain(v) for k,v in row.items()} for row in rows]
async def main():
 server=await _connect_server('notion',_resolve_mcp_server_config(_get_mcp_servers()['notion']))
 async def call(name,args):
  r=await server.session.call_tool(name,args)
  if r.is_error:
   Path('/tmp/hermes-notion-sync-error.txt').write_text(name+' '+str([b.text for b in r.content if hasattr(b,'text')])[:3000]);raise RuntimeError('Notion operation failed')
  return json.loads(next(b.text for b in r.content if hasattr(b,'text')))
 try:
  rows=[];cursor=None
  for _ in range(100):
   data={'mode':'view','view_url':'https://www.notion.so/24eb9588cb804dff9c1781babdf5f31f?v=5d6eb8b6c35c40939991d648fd33066f','page_size':100}
   if cursor:data['start_cursor']=cursor
   v=await call('notion-query-data-sources',{'data':data})
   batch=v.get('results');assert isinstance(batch,list);rows+=plain_rows(batch)
   if not v.get('has_more'):break
   cursor=v.get('next_cursor')
   if not cursor:raise RuntimeError('Incomplete view')
  else:raise RuntimeError('Incomplete library')
  # Add only absent fields. Existing user properties and page contents stay intact.
  cols=['Email subject','Email draft','Draft status']
  missing=[c for c in cols if rows and c not in rows[0]]
  if missing:await call('notion-update-data-source',{'data_source_id':source,'statements':'; '.join('ADD COLUMN "'+c+'" RICH_TEXT' for c in missing)})
  state['known']=list(set(state['known']).union(*(set(re.findall(r'(?:lead|prospect):\d+',str(r.get('Source IDs','')))) for r in rows)));save_state()
  changed=0;created=0
  for row in payload['rows']:
   ids=set(re.findall(r'(?:lead|prospect):\d+',row['sourceIds']))
   matches=[r for r in rows if ids.intersection(re.findall(r'(?:lead|prospect):\d+',str(r.get('Source IDs',''))))]
   if not matches and ids.intersection(state['known']):continue # Archived or filtered known page, never recreate it.
   if not matches and ids.intersection(state['uncertain']):continue # A prior create must be reconciled manually if not visible.
   if matches:state['uncertain']=[i for i in state['uncertain'] if i not in ids];save_state()
   if len(matches)>1:raise RuntimeError('Conflicting source mappings')
   draft=next(iter((row.get('review') or {}).get('drafts',[])),{})
   props={'Name':row.get('name') or row.get('company') or 'Unnamed business','Business':row.get('company') or row.get('name',''),'Contact name':' '.join(filter(None,[row.get('first_name'),row.get('last_name')])),'Source IDs':row['sourceIds'],'Brand':row.get('brand',''),'CRM status':row.get('status',''),'Audience':row.get('audience',''),'City':row.get('city',''),'Record type':'CRM lead' if row['recordType']=='lead' else 'Collected prospect','Email':row.get('email') or None,'Phone':row.get('phone') or None,'Website':row.get('website') or None,'Email source':row.get('email_source_url') or None,'Email subject':draft.get('subject',''),'Email draft':draft.get('body',''),'Draft status':draft.get('status','')}
   for social in row.get('socials',[]):
    key={'linkedin':'LinkedIn','facebook':'Facebook','instagram':'Instagram','tiktok':'TikTok'}.get(social.get('platform'))
    if key:props[key]=social['value']
   if row.get('contactForm'):props['Contact form']=row['contactForm']
   if row.get('bigin_id'):props['Bigin ID']=row['bigin_id']
   # Notion opt-outs and manually enriched contact fields win over an empty local field.
   if matches:
    existing=matches[0]
    props={k:v for k,v in props.items() if (v or k in ['Email subject','Email draft','Draft status']) and str(existing.get(k) or '')!=str(v or '')}
    if not props:continue
    page_id=re.search(r'([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9-]{27,})',existing['url']).group(1)
    await call('notion-update-page',{'page_id':page_id,'command':'update_properties','properties':props});changed+=1
   else:
    state['uncertain']=list(set(state['uncertain']).union(ids));save_state()
    await call('notion-create-pages',{'parent':{'data_source_id':source.replace('collection://','')},'allow_async':False,'pages':[{'properties':props,'content':'Automatically collected public business contact. Review the email in Hermes before sending.'}]});created+=1
    state['known']=list(set(state['known']).union(ids));state['uncertain']=[i for i in state['uncertain'] if i not in ids];save_state()
  return {'ok':True,'created':created,'updated':changed,'unresolved':state['uncertain']}
 finally:await server.shutdown()
try:
 _ensure_mcp_loop();print(json.dumps(_run_on_mcp_loop(main(),timeout=590)))
except Exception:print(json.dumps({'ok':False,'error':'Notion could not refresh the full library. The last successful copy is preserved.'}))
finally:_stop_mcp_loop_if_idle()
