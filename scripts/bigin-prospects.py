"""Contact-only Bigin synchronization. Never invokes mail, deletion, or workflow tools."""
import json,os,sys,asyncio
from pathlib import Path
sys.path.insert(0,str(Path.home()/'.hermes/hermes-agent'))
import hermes_bootstrap
from hermes_cli.mcp_config import _get_mcp_servers,_resolve_mcp_server_config
from tools.mcp_tool_loop import _ensure_mcp_loop,_run_on_mcp_loop
from tools.mcp_tool_discovery import _connect_server
from tools.mcp_tool_lifecycle import _stop_mcp_loop_if_idle
request=json.load(sys.stdin)
async def main():
 server=await _connect_server('bigin',_resolve_mcp_server_config(_get_mcp_servers()['bigin']))
 async def call(name,args):
  r=await server.session.call_tool(name,args)
  if r.is_error: raise RuntimeError('Bigin request failed')
  blocks=[b.text for b in r.content if hasattr(b,'text')]
  if not blocks: return {}
  return json.loads(blocks[0])
 try:
  contacts=[]
  for page in range(1,11):
   result=await call('Bigin_getRecords',{'path_variables':{'module_api_name':'Contacts'},'query_params':{'fields':'First_Name,Last_Name,Email,Email_Opt_Out,Mobile,Mailing_City','page':page,'per_page':200}})
   if result.get('code') and result.get('code')!='NO_CONTENT': raise RuntimeError('Bigin read failed')
   contacts+=result.get('data',[])
   if not result.get('info',{}).get('more_records'):break
  else: raise RuntimeError('Too many contacts for safe reconciliation')
  prospects=request.get('prospects',[])
  pending=[]
  for p in prospects:
   email=p.get('email','').strip().lower()
   found=[c for c in contacts if str(c.get('Email') or '').lower()==email]
   if request.get('promote') and not found and p.get('eligible') and email:
    pending.append({'Last_Name':(p.get('contact') or p['name'])[:80],'Email':email,'Description':'Imported from Hermes. Business: '+p['name']+'\nSource: '+p['notionUrl'],'Mailing_City':p.get('city','')[:100],'Mobile':p.get('phone','')[:30]})
  warning=''
  if pending:
   try:
    result=await call('Bigin_upsertRecords',{'path_variables':{'module_api_name':'Contacts'},'body':{'data':pending,'duplicate_check_fields':['Email'],'trigger':[]}})
    if any(r.get('status')!='success' for r in result.get('data',[])) or not result.get('data'): warning='Some contacts were declined. Check Bigin account limits and required fields.'
   except Exception: warning='Transfer did not return confirmation. Contacts were rechecked before reporting links.'
   contacts=[]
   for page in range(1,11):
    result=await call('Bigin_getRecords',{'path_variables':{'module_api_name':'Contacts'},'query_params':{'fields':'First_Name,Last_Name,Email,Email_Opt_Out','page':page,'per_page':200}})
    contacts+=result.get('data',[])
    if not result.get('info',{}).get('more_records'):break
  output=[]
  for p in prospects:
   email=p.get('email','').strip().lower()
   found=[c for c in contacts if email and str(c.get('Email') or '').lower()==email]
   if len(found)==1:output.append({'id':p['id'],'biginId':found[0]['id'],'doNotContact':bool(found[0].get('Email_Opt_Out'))})
   elif len(found)>1:output.append({'id':p['id'],'error':'Multiple Bigin contacts have this email. Review in Bigin.'})
   elif request.get('promote') and p.get('eligible'):output.append({'id':p['id'],'error':warning or 'Contact not found after transfer. Review in Bigin before retrying.'})
   elif not request.get('promote'):output.append({'id':p['id']})
  return {'ok':True,'mappings':output}

 finally: await server.shutdown()
try:
 _ensure_mcp_loop();print(json.dumps(_run_on_mcp_loop(main(),timeout=230)))
except Exception: print(json.dumps({'ok':False,'error':'Bigin sync did not finish. Refresh before retrying; some contacts may already exist.'}))
finally:_stop_mcp_loop_if_idle()
