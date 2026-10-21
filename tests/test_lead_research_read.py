"""Read-only pagination contract, without Hermes or a live Notion connection."""
import asyncio
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
spec = importlib.util.spec_from_file_location('lead_read', Path(__file__).parents[1] / 'scripts/lead-research.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Session:
    def __init__(self, batches):
        self.batches = iter(batches)
        self.calls = []
    async def call_tool(self, name, args):
        self.calls.append((name, args))
        return SimpleNamespace(is_error=False, content=[SimpleNamespace(text=json.dumps({'results': next(self.batches)}))])

class ReadTests(unittest.TestCase):
    def test_pages_all_results(self):
        first = [{'url': f'https://www.notion.so/{i:032x}'} for i in range(100)]
        session = Session([first, [{'url': 'https://www.notion.so/' + 'f'*32}]])
        rows = asyncio.run(module.query_source(session, module.SOURCES['companies']))
        self.assertEqual(len(rows), 101)
        self.assertIn('OFFSET 100', session.calls[1][1]['data']['query'])
        self.assertTrue(all(n == 'notion-query-data-sources' for n, _ in session.calls))
    def test_repeated_page_fails_instead_of_truncating(self):
        first = [{'url': f'https://www.notion.so/{i:032x}'} for i in range(100)]
        with self.assertRaises(RuntimeError):
            asyncio.run(module.query_source(Session([first, first]), module.SOURCES['companies']))
    def test_normalizes_text_and_retains_urls(self):
        self.assertEqual(module.plain('[Source](https://example.test)<br>A &amp; B'), 'Source (https://example.test)\nA & B')

if __name__ == '__main__':
    unittest.main()
