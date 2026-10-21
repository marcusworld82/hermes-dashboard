"""Read only the five Lead Research sources through Hermes's Notion connection.

No writes, scraping, model calls, or paid discovery. The caller owns the last good cache.
"""
import html
import json
from pathlib import Path
import re
import sys

SOURCES = {
    'companies': 'e52e94bc-1536-4467-b595-80cafadf63fa',
    'people': 'a814d082-803b-4f07-b69d-81afadd329cb',
    'opportunities': 'db4cc901-64e1-407a-92bb-b8aa51c95925',
    'evidence': '7ea54a55-a293-4ba4-96cd-e501416fd9f7',
    'runLog': '9ce0dd98-b540-4277-9c2d-e2530e12388c',
}


class RateLimitError(RuntimeError):
    pass


def plain(value):
    if isinstance(value, list):
        return [plain(v) for v in value]
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if not isinstance(value, str):
        return value
    value = re.sub(r'<br\s*/?>', '\n', value)
    value = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', lambda m: m[1] if m[1] == m[2] else m[1] + ' (' + m[2] + ')', value)
    return html.unescape(re.sub(r'\\([\\`*{}\[\]()#+\-.!_|>])', r'\1', value))


async def query_source(session, source):
    """SQL mode supports LIMIT/OFFSET; rows mode currently has no cursor."""
    rows = []
    seen = set()
    table = 'collection://' + source
    for offset in range(0, 10000, 100):
        result = await session.call_tool('notion-query-data-sources', {'data': {
            'mode': 'sql', 'data_source_urls': [table],
            'query': f'SELECT * FROM "{table}" ORDER BY url LIMIT 100 OFFSET {offset}',
        }})
        raw = next(b.text for b in result.content if hasattr(b, 'text'))
        if 'usage_limit_reached' in raw:
            raise RateLimitError('Notion query allowance is exhausted')
        if result.is_error:
            raise RuntimeError('Source unavailable')
        value = json.loads(raw)
        batch = value.get('results')
        if not isinstance(batch, list):
            raise RuntimeError('Missing rows')
        for row in batch:
            if not isinstance(row, dict) or not row.get('url') or row['url'] in seen:
                raise RuntimeError('Invalid or repeated page')
            seen.add(row['url'])
        rows.extend(plain(batch))
        if len(batch) < 100:
            return rows
    raise RuntimeError('Source exceeds safe read limit')


async def main():
    from hermes_cli.mcp_config import _get_mcp_servers, _resolve_mcp_server_config
    from tools.mcp_tool_discovery import _connect_server
    server = await _connect_server('notion', _resolve_mcp_server_config(_get_mcp_servers()['notion']))
    try:
        result = {'ok': True}
        for name, source in SOURCES.items():
            result[name] = await query_source(server.session, source)
        return result
    finally:
        await server.shutdown()


if __name__ == '__main__':
    sys.path.insert(0, str(Path.home() / '.hermes/hermes-agent'))
    import hermes_bootstrap  # noqa: F401
    from tools.mcp_tool_loop import _ensure_mcp_loop, _run_on_mcp_loop
    from tools.mcp_tool_lifecycle import _stop_mcp_loop_if_idle
    try:
        _ensure_mcp_loop()
        print(json.dumps(_run_on_mcp_loop(main(), timeout=110)))
    except Exception as error:
        # Never emit raw connector errors, which can contain authentication details.
        print(json.dumps({'ok': False, 'code': 'rate_limited' if isinstance(error, RateLimitError) else 'read_failed', 'error': 'Notion query allowance is exhausted. Wait for the allowance to reset.' if isinstance(error, RateLimitError) else 'Lead Research could not be read through Hermes Notion. Check the connection and page sharing. The last good copy is preserved.'}))
    finally:
        _stop_mcp_loop_if_idle()
