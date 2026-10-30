import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleSync} from '../cloud/src/lib/server/sync-handler.mjs';
const request=(body,authorization='Bearer test')=>new Request('https://dashboard.test/api/sync',{method:'POST',headers:{authorization},body:JSON.stringify(body)});
const registration={version:1,bridgeUrl:'https://unit-test.trycloudflare.com',registerOnly:true};
test('sync stays authenticated and validates before touching storage',async()=>{
 let calls=0;const options={secret:'test',readState:async()=>{calls++;},saveState:async()=>{calls++;}};
 assert.equal((await handleSync(request(registration,'Bearer wrong'),options)).status,401);
 assert.equal((await handleSync(request({...registration,bridgeUrl:'http://127.0.0.1'}),options)).status,400);
 assert.equal(calls,0);
});
test('storage suspension reports unavailable rather than invalid data or an offline Mac',async()=>{
 const response=await handleSync(request(registration),{secret:'test',readState:async()=>{throw Error('private provider message')},saveState:async()=>{throw Error('not reached')}});
 assert.equal(response.status,503);const body=await response.json();
 assert.equal(body.storageUnavailable,true);assert.equal(JSON.stringify(body).includes('private provider message'),false);
});
test('registering a tunnel preserves saved views and their actual saved time',async()=>{
 let saved;const previous={syncedAt:'2026-10-29T00:00:00Z',responses:{'/api/social/studio':{drafts:[]}}};
 const response=await handleSync(request(registration),{secret:'test',readState:async()=>previous,saveState:async value=>{saved=value}});
 assert.equal(response.status,200);assert.equal(saved.syncedAt,previous.syncedAt);assert.deepEqual(saved.responses,previous.responses);
});
