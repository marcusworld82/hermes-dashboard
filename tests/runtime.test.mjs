import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProfiles } from '../src/lib/server/hermes.ts';

test('long profile display names preserve id and gateway', () => {
 const rows=parseProfiles(' ◆Marcus Head Agent (default) gpt-6.1-sol                  running      -            -\n  Jordan (jordan) gpt-6-sol                    running      -            -');
 assert.equal(rows[0].id,'default'); assert.equal(rows[1].id,'jordan');
});
test('pipeline reads never persist shipping or Obsidian notes', () => {
 const source=readFileSync(new URL('../src/lib/server/pipeline.ts',import.meta.url),'utf8');
 const read=source.slice(source.indexOf('export async function listPipeline'), source.indexOf('export async function reconcilePipeline'));
 assert.doesNotMatch(read,/await ship\(/);
 assert.doesNotMatch(source,/logProject\(/);
});

test('dotenv lookup selects exact key and supports quotes without executing text', async () => {
 const { dotenvValue }=await import('../src/lib/server/models.ts');
 assert.equal(dotenvValue('OTHER_KEY=ignore\nexport OPENROUTER_API_KEY="private-test-value"\n','OPENROUTER_API_KEY'),'private-test-value');
 assert.equal(dotenvValue('OTHER_OPENROUTER_API_KEY=bad','OPENROUTER_API_KEY'),undefined);
});

test('direct OpenRouter skips a chat-restricted configured model, never authentication failures', async () => {
 const {sendConfiguredOpenRouter}=await import('../src/lib/server/models.ts'); const seen=[];
 const out=await sendConfiguredOpenRouter(['agentic','configured-chat'],async(model)=>{seen.push(model);if(model==='agentic')throw Error('403 agentic harness only');return 'OK';});
 assert.deepEqual(seen,['agentic','configured-chat']);assert.match(out,/OpenRouter model: configured-chat/);
 let calls=0;
 await assert.rejects(()=>sendConfiguredOpenRouter(['first','second'],async()=>{calls++;throw Error('401 unavailable');}),/401/);
 assert.equal(calls,1);
});
