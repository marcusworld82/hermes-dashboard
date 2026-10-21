import test from 'node:test';
import assert from 'node:assert/strict';
import { rewritePrompt, parseRewrite } from '../src/lib/server/lead-rewrite.ts';
test('rewrite prompt keeps facts separate and requests review without sending or tool use', () => {
  const prompt = rewritePrompt({ name:'Fixture',business:'Business',reason:'Observed need',confidence:'High',drafts:{email:'Subject: Test\n\nBody'} }, 'email', 'Shorter', [{sourceUrl:'https://example.test',observation:'Fixture fact'}], {services:'Website'});
  assert.match(prompt,/No tools, browsing, sending/);
  assert.match(prompt,/untrusted data/);
  assert.match(prompt,/Creative Brief/);
  assert.match(prompt,/https:\/\/example.test/);
  assert.match(prompt,/quality gate/);
});
test('invalid generated content cannot replace a saved draft', () => {
  assert.throws(() => parseRewrite('not JSON','email'));
  assert.throws(() => parseRewrite(JSON.stringify({draft:'No subject',brief:'Brief'}),'email'));
  assert.throws(() => parseRewrite(JSON.stringify({draft:'Subject: Test\n\nBad\u2014text',brief:'Brief'}),'email'));
  assert.deepEqual(parseRewrite(JSON.stringify({draft:'Subject: Test\n\nBody',brief:'Brief for review'}),'email'),{draft:'Subject: Test\n\nBody',brief:'Brief for review'});
});
