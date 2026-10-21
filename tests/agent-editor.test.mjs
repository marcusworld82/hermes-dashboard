import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { metadataText } from '../src/lib/server/profile-display.ts';
test('profile editor passes spare-profile CLI save, revert, secret exclusion and conflict checks', { timeout: 120000 }, () => {
  const [python] = JSON.parse(execFileSync(path.join(os.homedir(), '.local/bin/hermes'), ['--print-runtime-command'], { encoding:'utf8',timeout:10000 }));
  const output = execFileSync(python, ['-I', path.join(process.cwd(), 'tests/agent-editor-checks.py')], { encoding:'utf8',timeout:110000 });
  assert.equal(output, '');
});

test('roster metadata reader exposes only name and role text', () => {
  const yaml='display_name: "Spare agent"\ndescription: |\n  First line\n  Second line\nsecret: FAKE\n';
  assert.equal(metadataText(yaml,'display_name'),'Spare agent');
  assert.equal(metadataText(yaml,'description'),'First line\nSecond line');
});
