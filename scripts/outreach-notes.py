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
payload=json.load(sys.stdin)
async def main():
 server=await _connect_server('bigin',_resolve_mcp_server_config(_get_mcp_servers()['bigin']))
 async def call(name,args):
  r=await server.session.call_tool(name,args)
  if r.is_error:
   Path('/tmp/hermes-bigin-sync-error.txt').write_text(name+' '+str([b.text for b in r.content if hasattr(b,'text')])[:3000]);raise RuntimeError('Bigin operation failed')
  value=json.loads(next(b.text for b in r.content if hasattr(b,'text')))
  if value.get('code') and value.get('code')!='NO_CONTENT':raise RuntimeError('Bigin operation declined')
  if name=='Bigin_addNotes' and (not value.get('data') or any(r.get('status')!='success' for r in value['data'])):raise RuntimeError('Note was not confirmed')
  return value
 try:
  created=0
  for mapping in payload['mappings']:
   msgs=[m for m in payload['messages'] if m['lead_id']==mapping['leadId']]
   if not msgs:continue
   notes=[]
   for page in range(1,51):
    v=await call('Bigin_getNotesFromSpecificRecord',{'path_variables':{'module_api_name':'Contacts','id':mapping['biginId']},'query_params':{'fields':'Note_Title,Note_Content','page':page,'per_page':200}})
    data=v.get('data',[])
    if not isinstance(data,list):raise RuntimeError('Notes unavailable')
    notes+=data
    if not v.get('info',{}).get('more_records'):break
   else:raise RuntimeError('Incomplete note history')
   titles={n.get('Note_Title') for n in notes}
   for m in msgs:
    title=f"Hermes CRM message {m['id']}"
    if title in titles:continue
    content=f"{m['direction']} | {m['at']}\n{m.get('subject','')}\n\n{m.get('body','')}"[:30000]
    await call('Bigin_addNotes',{'body':{'data':[{'Note_Title':title,'Note_Content':content,'Parent_Id':mapping['biginId'],'se_module':'Contacts'}]}});created+=1;titles.add(title)
  return {'ok':True,'created':created}
 finally:await server.shutdown()
try:
 _ensure_mcp_loop();print(json.dumps(_run_on_mcp_loop(main(),timeout=590)))
except Exception:print(json.dumps({'ok':False,'error':'Notion could not refresh the full library. The last successful copy is preserved.'}))
finally:_stop_mcp_loop_if_idle()
