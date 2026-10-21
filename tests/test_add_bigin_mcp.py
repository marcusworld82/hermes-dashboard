import unittest,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('adapter',Path(__file__).parents[1]/'scripts/add-bigin-mcp.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RegistrationTests(unittest.TestCase):
 def test_probes_and_saves_without_terminal_prompts(self):
  writes=[]
  result=m.register({'url':'https://revealhouse-941875449.zohomcp.com/mcp/test-token/message'},{},lambda *_:[('read',''),('write','')],lambda n,c:writes.append((n,c)) or True)
  self.assertEqual(result,{'ok':True,'toolCount':2});self.assertEqual(writes[0][0],'bigin');self.assertEqual(writes[0][1]['auth'],'oauth')
 def test_failed_probe_never_saves(self):
  writes=[]
  with self.assertRaises(ValueError):m.register({'url':'https://revealhouse-941875449.zohomcp.com/mcp/test-token/message'},{},lambda *_:[],lambda *a:writes.append(a))
  self.assertEqual(writes,[])
 def test_masked_and_foreign_urls_rejected(self):
  for url in ['https://revealhouse-941875449.zohomcp.com/mcp/****/message','https://evil.example/mcp/key/message']:
   with self.assertRaises(ValueError):m.register({'url':url},{},lambda *_:self.fail('Must not connect'),lambda *_:True)
 def test_existing_connection_not_overwritten(self):
  with self.assertRaises(ValueError):m.register({'url':'https://revealhouse-941875449.zohomcp.com/mcp/test-token/message'},{'bigin':{}},lambda *_:[],lambda *_:True)
if __name__=='__main__':unittest.main()
