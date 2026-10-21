import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock,patch

spec=importlib.util.spec_from_file_location('clients_bridge',Path(__file__).resolve().parents[1]/'scripts/clients.py')
clients=importlib.util.module_from_spec(spec);spec.loader.exec_module(clients)
CID='1'*32
class ClientsBridgeTests(unittest.IsolatedAsyncioTestCase):
 async def test_stale_updates_do_not_write(self):
  state={'clients':[{'url':'https://app.notion.com/p/'+CID,'Last Edited':'new'}],'deliverables':[],'sources':{}}
  with patch.object(clients,'read',AsyncMock(return_value=state)),patch.object(clients,'call',AsyncMock()) as call:
   with self.assertRaises(RuntimeError):await clients.write(None,{'kind':'clients','id':CID,'expectedEdited':'old','properties':{'Stage':'Review'}})
   call.assert_not_called()

 async def test_repeated_submission_reuses_master_row(self):
  state={'clients':[{'url':'https://app.notion.com/p/'+CID,'Client Key':'manual:one'}],'deliverables':[],'sources':{}}
  with patch.object(clients,'read',AsyncMock(return_value=state)),patch.object(clients,'call',AsyncMock()) as call:
   result=await clients.write(None,{'kind':'clients','properties':{'Name':'A','Client Key':'manual:one'}})
   self.assertEqual(result['id'],CID);self.assertTrue(result['existing']);call.assert_not_called()

 async def test_unknown_create_is_not_retried(self):
  state={'clients':[],'deliverables':[],'sources':{'clients':'source'}}
  with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{'HERMES_DATA_DIR':tmp}),patch.object(clients,'read',AsyncMock(return_value=state)),patch.object(clients,'schema',AsyncMock(return_value={})),patch.object(clients,'call',AsyncMock(side_effect=RuntimeError('uncertain'))) as call:
   payload={'kind':'clients','properties':{'Name':'A','Client Key':'manual:one'}}
   with self.assertRaises(RuntimeError):await clients.write(None,payload)
   with self.assertRaises(RuntimeError):await clients.write(None,payload)
   self.assertEqual(call.call_count,1)

 async def test_deliverable_requires_an_existing_client(self):
  state={'clients':[],'deliverables':[],'sources':{'deliverables':'source'}}
  with patch.object(clients,'read',AsyncMock(return_value=state)),patch.object(clients,'call',AsyncMock()) as call:
   with self.assertRaises(ValueError):await clients.write(None,{'kind':'deliverables','properties':{'Name':'Clip','Deliverable Key':'manual:one','Client':[CID]}})
   call.assert_not_called()

 def test_schema_has_required_relationship_and_no_sample_rows(self):
  schema=clients.table_schema('deliverables','11111111-1111-1111-1111-111111111111')
  self.assertIn("DUAL 'Deliverables'",schema);self.assertIn('"Kanban Card ID"',schema);self.assertNotIn('INSERT',schema)
