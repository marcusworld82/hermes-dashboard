import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('connection_probe', Path(__file__).parents[1] / 'scripts/connection-probe.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ProbeTests(unittest.TestCase):
    def test_failed_credential_preserves_error_and_redacts_secret(self):
        calls = []
        async def call(name, args):
            calls.append((name, args))
            return SimpleNamespace(is_error=True, content=[SimpleNamespace(text='HTTP 401: invalid credential token=FAKE_SECRET_123')])
        async def shutdown():
            calls.append('shutdown')
        async def connect(name, config):
            return SimpleNamespace(session=SimpleNamespace(call_tool=call), shutdown=shutdown)
        result = asyncio.run(module.probe('bigin', lambda: {'bigin': {'token': 'FAKE_SECRET_123'}}, lambda value: value, connect))
        self.assertFalse(result['ok'])
        self.assertIn('HTTP 401: invalid credential', result['error'])
        self.assertNotIn('FAKE_SECRET_123', result['error'])
        self.assertEqual(calls[0][0], 'Bigin_getRecords')
        self.assertEqual(calls[0][1]['query_params']['per_page'], 1)
        self.assertEqual(calls[-1], 'shutdown')

    def test_disabled_server_never_connects(self):
        async def connect(*args):
            self.fail('Disabled server must not connect')
        result = asyncio.run(module.probe('notion', lambda: {'notion': {'enabled': False}}, lambda value: value, connect))
        self.assertFalse(result['ok'])
        self.assertIn('disabled', result['error'])

    def test_only_fixed_read_tools_are_available(self):
        self.assertEqual({value[0] for value in module.PROBES.values()}, {'notion-query-data-sources', 'Bigin_getRecords', 'list_projects', 'list_teams'})

if __name__ == '__main__':
    unittest.main()
