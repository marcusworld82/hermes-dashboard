"""Read-only connection probe using Hermes's existing MCP credentials.
No credentials, provider URLs, or exception bodies are printed.
"""
import json, os, sys, asyncio
from pathlib import Path
root=Path(os.environ.get('HERMES_HOME', str(Path.home()/'.hermes')))/'hermes-agent'
sys.path.insert(0,str(root))
import hermes_bootstrap
from hermes_cli.mcp_config import _get_mcp_servers, _resolve_mcp_server_config
from tools.mcp_tool_loop import _ensure_mcp_loop, _run_on_mcp_loop
from tools.mcp_tool_discovery import _connect_server
from tools.mcp_tool_lifecycle import _stop_mcp_loop_if_idle
name=sys.argv[1] if len(sys.argv)>1 else ''
if name not in ('bigin','notion'):
 print(json.dumps({'ok':False,'error':'Unsupported connection'}));sys.exit(1)
config=_get_mcp_servers().get(name)
if not config:
 print(json.dumps({'ok':False,'configured':False,'error':'Add this MCP server in Connections first.'}));sys.exit(0)
async def probe():
 server=await asyncio.wait_for(_connect_server(name,_resolve_mcp_server_config(config)),30)
 try:
  return {'ok':True,'configured':True,'toolCount':len(server._tools),'tools':[t.name for t in server._tools]}
 finally:
  await server.shutdown()
try:
 _ensure_mcp_loop()
 result=_run_on_mcp_loop(probe(),timeout=40)
 print(json.dumps(result))
except Exception:
 print(json.dumps({'ok':False,'configured':True,'error':'MCP authentication or connection failed. Reconnect this server in Hermes.'}))
finally:
 _stop_mcp_loop_if_idle()
