"""Noninteractive Bigin MCP registration. Secret input is accepted only on stdin."""
import json,sys,os
from pathlib import Path
from urllib.parse import urlsplit

def register(data, servers, probe, save):
    url=str(data.get('url','')).strip()
    parsed=urlsplit(url)
    if parsed.scheme!='https' or parsed.hostname!='revealhouse-941875449.zohomcp.com' or parsed.username or parsed.password or parsed.port or parsed.query or parsed.fragment:
        raise ValueError('Use the Server URL from your revealhouse Zoho MCP page.')
    import re
    if not re.fullmatch(r'/mcp/[A-Za-z0-9._~-]+/message',parsed.path):
        raise ValueError('Copy the complete Server URL. A masked URL cannot connect.')
    if 'bigin' in servers:
        raise ValueError('Bigin is already configured. Test its connection before replacing it.')
    config={'url':url,'enabled':True,'auth':'oauth','connect_timeout':180}
    tools=probe('bigin',config)
    if not tools: raise ValueError('Bigin returned no tools. Nothing was saved.')
    if not save('bigin',config): raise ValueError('Hermes could not save Bigin.')
    return {'ok':True,'toolCount':len(tools)}

def main():
    stage='input'
    try:
        data=json.loads(sys.stdin.read(16385))
        if len(str(data.get('url','')))>2048: raise ValueError('The URL is too long.')
        root=Path(os.environ.get('HERMES_HOME',str(Path.home()/'.hermes')))/'hermes-agent'
        sys.path.insert(0,str(root))
        import hermes_bootstrap
        from hermes_cli.mcp_config import _get_mcp_servers,_probe_single_server,_save_mcp_server
        import contextlib,io
        stage='connection'
        with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            result=register(data,_get_mcp_servers(),_probe_single_server,_save_mcp_server)
        print(json.dumps(result))
    except Exception as exc:
        reason=str(exc).lower()
        category=next((word for word in ('401','403','404','timeout','timed out','validation','masked','no tools','already configured','not found','module') if word in reason),'other')
        print(json.dumps({'ok':False,'error':'Bigin was not saved. Check the complete Server URL and Zoho authorization, then retry.','stage':stage,'category':category,'exception':type(exc).__name__}))
        sys.exit(1)
if __name__=='__main__': main()
