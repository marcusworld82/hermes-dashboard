"""Fixed read-only MCP checks. Returns evidence, never remote records or secrets."""
import json
import re
import sys
from pathlib import Path


PROBES = {
    'notion': ('notion-query-data-sources', {'data': {'mode': 'view', 'view_url': 'https://www.notion.so/24eb9588cb804dff9c1781babdf5f31f?v=5d6eb8b6c35c40939991d648fd33066f', 'page_size': 1}}),
    'bigin': ('Bigin_getRecords', {'path_variables': {'module_api_name': 'Contacts'}, 'query_params': {'fields': 'id', 'page': 1, 'per_page': 1}}),
    'supabase': ('list_projects', {}),
    'vercel': ('list_teams', {}),
}


def safe_error(error, secrets=()):
    text = str(error)
    for secret in sorted(secrets, key=len, reverse=True):
        if len(secret) > 5:
            text = text.replace(secret, '[redacted]')
    text = re.sub(r'https?://[^\s<>\"\']+', '[remote URL]', text)
    text = re.sub(r'(?i)(bearer\s+|(?:token|secret|password|api[_-]?key|authorization)[\"\s:=]+)[^\s,}\"\']+', r'\1[redacted]', text)
    return text[:600]


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)


async def probe(name, get_servers, resolve_config, connect):
    if name not in PROBES:
        return {'ok': False, 'error': 'Unsupported connection.'}
    server = None
    secrets = []
    try:
        config = get_servers().get(name)
        if not config or config.get('enabled') is False:
            raise ValueError('MCP server is missing or disabled in Hermes.')
        resolved = resolve_config(config)
        secrets = list(strings(resolved))
        # Include OAuth credentials only for redaction, never in output.
        for file in (Path.home() / '.hermes/mcp-tokens').glob(f'{name}*.json'):
            try:
                secrets.extend(strings(json.loads(file.read_text())))
            except (OSError, ValueError):
                pass
        server = await connect(name, resolved)
        tool, args = PROBES[name]
        result = await server.session.call_tool(tool, args)
        text = '\n'.join(b.text for b in result.content if hasattr(b, 'text'))
        if getattr(result, 'is_error', False) or getattr(result, 'isError', False):
            raise RuntimeError(text or 'MCP tool returned an error.')
        try:
            payload = json.loads(text)
        except ValueError:
            payload = None
        if isinstance(payload, dict) and (payload.get('error') or payload.get('status') == 'error' or (payload.get('code') and payload['code'] not in ('NO_CONTENT', 'SUCCESS'))):
            raise RuntimeError(json.dumps(payload))
        if not text and not getattr(result, 'structuredContent', None):
            raise RuntimeError('MCP tool returned no readable response.')
        return {'ok': True, 'detail': f'Authenticated read succeeded ({tool}).'}
    except Exception as error:
        return {'ok': False, 'error': safe_error(f'{type(error).__name__}: {error}', secrets)}
    finally:
        if server:
            await server.shutdown()


if __name__ == '__main__':
    # The Hermes runtime supplies MCP auth and OAuth refresh support.
    sys.path.insert(0, str(Path.home() / '.hermes/hermes-agent'))
    import hermes_bootstrap  # noqa: F401
    from hermes_cli.mcp_config import _get_mcp_servers, _resolve_mcp_server_config
    from tools.mcp_tool_loop import _ensure_mcp_loop, _run_on_mcp_loop
    from tools.mcp_tool_discovery import _connect_server
    from tools.mcp_tool_lifecycle import _stop_mcp_loop_if_idle
    try:
        _ensure_mcp_loop()
        print(json.dumps(_run_on_mcp_loop(probe(sys.argv[1], _get_mcp_servers, _resolve_mcp_server_config, _connect_server), timeout=40)))
    except Exception as error:
        # Outer failures can contain transport credentials, so omit their raw text.
        print(json.dumps({'ok': False, 'error': f'{type(error).__name__}: MCP check did not finish within its runtime limit.'}))
    finally:
        _stop_mcp_loop_if_idle()
