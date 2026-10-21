import asyncio
import importlib.util
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('lead_write', Path(__file__).parents[1] / 'scripts/lead-research-write.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Session:
    def __init__(self):
        self.rows = {k: [] for k in module.DATA_SOURCES}
        self.mutations = []
    async def call_tool(self, name, args):
        if name == 'notion-query-data-sources':
            source = args['data']['data_source_urls'][0].removeprefix('collection://')
            db = next(k for k,v in module.DATA_SOURCES.items() if v == source)
            value = {'results': self.rows[db]}
        elif name == 'notion-create-pages':
            db = next(k for k,v in module.DATA_SOURCES.items() if v == args['parent']['data_source_id'])
            row = dict(args['pages'][0]['properties'])
            row['url'] = 'https://www.notion.so/' + format(sum(len(v) for v in self.rows.values()) + 1, '032x')
            self.rows[db].append(row)
            self.mutations.append((name, args))
            value = {'pages': [{'url': row['url']}]}
        elif name == 'notion-update-page':
            ident = args['page_id']
            row = next(r for rows in self.rows.values() for r in rows if module.page_id(r['url']) == ident)
            row.update(args['properties'])
            self.mutations.append((name, args))
            value = {'ok': True}
        else:
            raise AssertionError(name)
        return SimpleNamespace(is_error=False, content=[SimpleNamespace(text=json.dumps(value))])

class WriteTests(unittest.TestCase):
    def test_rerun_dedupes_and_preserves_manual_stage_drafts_and_high_confidence(self):
        session = Session()
        record = {'name': 'Fixture', 'stable_id': 'co:domain:example.test', 'root_domain': 'example.test', 'confidence': 'High', 'stage': 'Paused', 'draft_email': 'Subject: Saved\n\nManual draft', 'general_email': 'owner@example.test'}
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {'HERMES_DATA_DIR': tmp}):
            first = asyncio.run(module.sync(session, {'records': {'companies': [record]}}))
            record.update({'stage': 'New', 'draft_email': 'Overwrite', 'general_email': 'other@example.test', 'confidence': 'Low'})
            second = asyncio.run(module.sync(session, {'records': {'companies': [record]}}))
        self.assertEqual(first['created'], 1)
        self.assertEqual(second['created'], 0)
        self.assertEqual(len(session.rows['companies']), 1)
        row = session.rows['companies'][0]
        self.assertEqual(row['Stage'], 'Paused')
        self.assertEqual(row['Draft Email'], 'Subject: Saved\n\nManual draft')
        self.assertEqual(row['General Business Email'], 'owner@example.test')
    def test_identity_dedupe_does_not_merge_on_name(self):
        session = Session()
        records = [{'name': 'Same name', 'stable_id': 'one', 'root_domain': 'one.test'}, {'name': 'Same name', 'stable_id': 'two', 'root_domain': 'two.test'}, {'name': 'Alias', 'stable_id': 'alias', 'root_domain': 'one.test'}]
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {'HERMES_DATA_DIR': tmp}):
            result = asyncio.run(module.sync(session, {'records': {'companies': records}}))
        self.assertEqual(result['created'], 2)
        self.assertEqual(len(session.rows['companies']), 2)
    def test_two_pass_relations_and_full_draft_text(self):
        session = Session()
        body = 'Subject: Fixture\n\n' + 'x' * 2500
        records = {'companies': [{'name':'Fixture','stable_id':'company','draft_email':body}], 'evidence':[{'title':'Observation','stable_id':'ev','_relations':{'company_page_ids':['company']}}]}
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {'HERMES_DATA_DIR': tmp}):
            asyncio.run(module.sync(session, {'records':records}))
        self.assertEqual(session.rows['companies'][0]['Draft Email'], body)
        self.assertEqual(session.rows['evidence'][0]['Companies'], [module.page_id(session.rows['companies'][0]['url'])])
    def test_known_missing_page_is_not_recreated(self):
        session = Session()
        payload={'records':{'companies':[{'name':'Fixture','stable_id':'known'}]}}
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {'HERMES_DATA_DIR': tmp}):
            asyncio.run(module.sync(session, payload))
            session.rows['companies'] = []
            with self.assertRaises(RuntimeError):
                asyncio.run(module.sync(session,payload))
    def test_stale_master_edit_and_suppression_cannot_be_overwritten(self):
        session = Session()
        ident = 'a' * 32
        session.rows['companies'] = [{'url':'https://www.notion.so/' + ident, 'Name':'Fixture', 'Stage':'Denied', 'Last Edited':'2026-10-20T18:00:00Z'}]
        payload = {'db':'companies','id':ident,'expected':{'Stage':'New'},'properties':{'Stage':'Sent'}}
        with self.assertRaises(RuntimeError):
            asyncio.run(module.update(session,payload))
        payload['expected'] = {'Stage':'Denied'}
        with self.assertRaises(ValueError):
            asyncio.run(module.update(session,payload))
        self.assertEqual(session.mutations,[])

    def test_empty_sources_read_failure_makes_no_writes(self):
        session=Session()
        with TemporaryDirectory() as tmp, patch.dict(os.environ, {'HERMES_DATA_DIR': tmp}):
            with self.assertRaises(ValueError):
                asyncio.run(module.sync(session, {'records': {'companies': [{'name':'Missing ID'}]}}))
        self.assertEqual(session.mutations, [])

if __name__ == '__main__':
    unittest.main()
