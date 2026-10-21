import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
sys.path.insert(0, str(Path.home() / '.hermes/hermes-agent'))
import hermes_bootstrap
import yaml
spec = importlib.util.spec_from_file_location('editor', Path(__file__).parents[1] / 'scripts/agent-editor.py')
editor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(editor)

class EditorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory(prefix='hermes-editor-spare-')
        self.home = Path(self.tmp.name)
        self.root = self.home / 'profiles'
        self.folder = self.root / 'spare-editor'
        self.folder.mkdir(parents=True)
        self.data = self.home / 'data'
        (self.folder / 'config.yaml').write_text(yaml.safe_dump({'model':{'provider':'openai-codex','default':'gpt-5.6'},'skills':{'disabled':['disabled-skill','google-maps-list-builder']}, 'fixture_secret':'FAKE-SECRET-DO-NOT-EXPORT'}))
        (self.folder / 'profile.yaml').write_text('display_name: Spare\ndescription: Original role\n')
        (self.folder / 'SOUL.md').write_text('Original safe instructions.')
        for name in ['enabled-skill','disabled-skill','google-maps-list-builder']:
            d = self.folder / 'skills' / name
            d.mkdir(parents=True)
            (d / 'SKILL.md').write_text('Fixture skill.')
    def tearDown(self):
        self.tmp.cleanup()
    def apply(self, state):
        env = {**os.environ, 'HERMES_HOME':str(self.home), 'HERMES_DISABLE_LAZY_INSTALLS':'1'}
        def cli(args):
            bootstrap = "import sys,runpy;sys.path.extend(" + repr([p for p in sys.path if 'site-packages' in p]) + ");sys.path.insert(0," + repr(str(Path.home()/'.hermes/hermes-agent')) + ");import hermes_bootstrap;runpy.run_module('hermes_cli.main',run_name='__main__',alter_sys=True)"
            result = subprocess.run([sys.executable,'-I','-c',bootstrap,*args],env=env,capture_output=True,text=True,timeout=30)
            self.assertEqual(result.returncode,0,'Spare Hermes CLI change failed')
        editor.apply_state('spare-editor',state,self.root,cli)
    def test_spare_profile_real_cli_preview_save_and_revert_preserve_unrelated_config(self):
        before = editor.read_snapshot('spare-editor',self.root)
        desired = {**before['state'],'displayName':'Spare edited','description':'Revised role','soul':'Revised safe instructions.','enabledSkills':['disabled-skill']}
        plan = editor.preview(before,desired)
        self.assertIn('Revised role',plan['diff'])
        self.assertNotIn('FAKE-SECRET',json.dumps(before))
        result = editor.save('spare-editor',desired,before['revision'],plan['previewHash'],self.root,self.data,self.apply)
        self.assertEqual(result['state'],desired)
        cfg = yaml.safe_load((self.folder/'config.yaml').read_text())
        self.assertEqual(cfg['fixture_secret'],'FAKE-SECRET-DO-NOT-EXPORT')
        self.assertIn('google-maps-list-builder',cfg['skills']['disabled'])
        audit = json.loads(next((self.data/'agent-edits'/'spare-editor').glob('*.json')).read_text())
        self.assertNotIn('FAKE-SECRET',json.dumps(audit))
        plan = editor.preview(result,before['state'])
        reverted = editor.save('spare-editor',before['state'],result['revision'],plan['previewHash'],self.root,self.data,self.apply)
        self.assertEqual(reverted['state'],before['state'])
    def test_stale_preview_cannot_save(self):
        current = editor.read_snapshot('spare-editor',self.root)
        desired={**current['state'],'soul':'New instructions'}
        plan=editor.preview(current,desired)
        (self.folder/'SOUL.md').write_text('External edit')
        with self.assertRaises(ValueError):
            editor.save('spare-editor',desired,current['revision'],plan['previewHash'],self.root,self.data,self.apply)
        self.assertEqual((self.folder/'SOUL.md').read_text(),'External edit')
    def test_rejects_path_escape_symlink_unknown_model_and_cosmetic_controls(self):
        with self.assertRaises(ValueError): editor.profile_dir('../spare-editor',self.root)
        current=editor.read_snapshot('spare-editor',self.root)
        for patch in [{'model':'made-up-model'},{'enabledSkills':['../../secret']},{'paused':True}]:
            with self.assertRaises(ValueError): editor.validate({**current['state'],**patch},current)
        (self.folder/'SOUL.md').unlink()
        (self.folder/'SOUL.md').symlink_to(self.folder/'config.yaml')
        with self.assertRaises(ValueError): editor.read_snapshot('spare-editor',self.root)
    def test_failed_save_rolls_back_and_audits(self):
        current=editor.read_snapshot('spare-editor',self.root)
        desired={**current['state'],'soul':'New instructions'}
        plan=editor.preview(current,desired)
        calls=[]
        def broken(state):
            calls.append(state)
            if len(calls)==1:
                (self.folder/'SOUL.md').write_text('Partial change')
                raise RuntimeError('Fixture failure')
            (self.folder/'SOUL.md').write_text(state['soul'])
        with self.assertRaises(RuntimeError): editor.save('spare-editor',desired,current['revision'],plan['previewHash'],self.root,self.data,broken)
        self.assertEqual((self.folder/'SOUL.md').read_text(),current['state']['soul'])
        audit=json.loads(next((self.data/'agent-edits'/'spare-editor').glob('*.json')).read_text())
        self.assertEqual(audit['status'],'rolled-back')

if __name__=='__main__': unittest.main()
