import test from 'node:test';import assert from 'node:assert/strict';
import {disabledSkills} from '../src/lib/server/profile-skill-policy.ts';
test('reads only the skills disabled list, not unrelated disabled values',()=>{assert.deepEqual(disabledSkills('other:\n  disabled:\n    - unrelated\nskills:\n  disabled:\n    - google-maps-list-builder\n    - second\nmodel:\n  default: test\n'),['google-maps-list-builder','second']);assert.deepEqual(disabledSkills('skills:\n  disabled: ["first", "second"]\n'),['first','second']);});
