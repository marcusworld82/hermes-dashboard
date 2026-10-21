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

import re,html
def plain(value):
 if not isinstance(value,str):return value
 value=re.sub(r'<br\s*/?>','\n',value)
 value=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',lambda m:m.group(1) if m.group(1)==m.group(2) else m.group(1)+' ('+m.group(2)+')',value)
 return html.unescape(re.sub(r'\\([\\`*{}\[\]()#+\-.!_|>])',r'\1',value))
def plain_rows(rows):return [{k:plain(v) for k,v in row.items()} for row in rows]
async def main():
 server=await _connect_server('notion',_resolve_mcp_server_config(_get_mcp_servers()['notion']))
 try:
  rows=[];cursor=None
  for _ in range(100):
   data={'mode':'view','view_url':'https://www.notion.so/24eb9588cb804dff9c1781babdf5f31f?v=5d6eb8b6c35c40939991d648fd33066f','page_size':100}
   if cursor:data['start_cursor']=cursor
   r=await server.session.call_tool('notion-query-data-sources',{'data':data})
   if r.is_error:raise RuntimeError('Notion view unavailable')
   value=json.loads(next(b.text for b in r.content if hasattr(b,'text')))
   batch=value.get('results')
   if not isinstance(batch,list):raise RuntimeError('Missing rows')
   rows+=plain_rows(batch)
   if not value.get('has_more'):return {'ok':True,'rows':rows}
   cursor=value.get('next_cursor')
   if not cursor:raise RuntimeError('Incomplete view')
  raise RuntimeError('Library exceeds safe read limit')

 finally:await server.shutdown()
try:
 _ensure_mcp_loop();print(json.dumps(_run_on_mcp_loop(main(),timeout=110)))
except Exception as e:
 Path('/tmp/hermes-notion-read-exception.txt').write_text(type(e).__name__+': '+str(e)[:400]);print(json.dumps({'ok':False,'error':'Notion could not refresh the full library. The last successful copy is preserved.'}))
finally:_stop_mcp_loop_if_idle()
