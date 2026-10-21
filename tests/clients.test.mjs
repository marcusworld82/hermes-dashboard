import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clients-test-'));
process.env.HERMES_DATA_DIR=dir;
const {parseClientCsv,validateClient,mapClients,clientCounts,createDeliverableCard,previewClientCsv}=await import('../src/lib/server/clients.ts');
const cid='11111111111111111111111111111111';const did='22222222222222222222222222222222';
test('CSV preserves quoted newlines and formulas as inert text',()=>{
 const rows=parseClientCsv('Name,Business,Notes,Price\r\n"=1+1","Example, Inc","Line one\nLine two",125.50');
 assert.equal(rows[0].name,'=1+1');assert.equal(rows[0].business,'Example, Inc');assert.equal(rows[0].notes,'Line one\nLine two');assert.equal(rows[0].price,125.5);assert.equal(rows[0].stage,'Onboarding');
});
test('CSV rejects missing names, duplicate or unknown headers, broken quotes and excess rows',()=>{
 for(const csv of ['Email\nx@example.com','Name,Name\nA,B','Name,Unknown\nA,B','Name\n"unfinished','Name,Price\nA,-1','Name,Start date\nA,2026-02-30','Name,Stage\nA,Fake'])assert.throws(()=>parseClientCsv(csv));
 assert.throws(()=>parseClientCsv('Name\n'+Array.from({length:101},(_,i)=>'N'+i).join('\n')),/100/);
 assert.throws(()=>parseClientCsv('x'.repeat(200001)),/200 KB/);
});
test('client validation rejects active links and accepts unknown prices',()=>{
 assert.throws(()=>validateClient({name:'A',links:'javascript:alert(1)'}),/http/);
 assert.throws(()=>validateClient({name:'A',price:NaN}),/Price/);
 assert.throws(()=>validateClient({name:'A',unknown:'value'}),/Unknown/);
 assert.equal(validateClient({name:'A'}).price,null);
});
test('master mapping keeps Notion identities and client-deliverable relation',()=>{
 const mapped=mapClients({ok:true,clients:[{url:'https://app.notion.com/p/'+cid,Name:'A',Stage:'Retainer','Last Edited':'2026-10-20T12:00:00Z'}],deliverables:[{url:'https://app.notion.com/p/'+did,Name:'Motion clip',Client:JSON.stringify([cid]),Status:'Review','date:Due Date:start':'2026-10-22'}]});
 assert.equal(mapped.clients[0].id,cid);assert.equal(mapped.clients[0].price,null);assert.equal(mapped.deliverables[0].clientId,cid);
 assert.throws(()=>mapClients({ok:true,clients:[{url:'https://evil.example/'+cid}],deliverables:[]}),/Notion/);
});
test('home counts use open stages and next seven days, separate overdue',()=>{
 const counts=clientCounts({clients:[{stage:'Retainer'},{stage:'Delivered'},{stage:'Paused'},{stage:'Review'}],deliverables:[{status:'Review',dueDate:'2026-10-20'},{status:'Planned',dueDate:'2026-10-26'},{status:'Delivered',dueDate:'2026-10-22'},{status:'Paused',dueDate:'2026-10-21'},{status:'Planned',dueDate:'2026-10-19'},{status:'Planned',dueDate:'2026-10-27'}]},new Date('2026-10-20T14:00:00Z'));
 assert.deepEqual(counts,{open:2,dueThisWeek:2,overdue:1});
});
test('CSV preview only saves local review state and does not write the master',()=>{
 const preview=previewClientCsv('Name,Email\nA,a@example.com');assert.equal(preview.rows.length,1);assert.equal(fs.readdirSync(dir).filter(f=>f.startsWith('clients-import-')).length,1);assert.equal(fs.existsSync(path.join(dir,'clients-live.json')),false);
});
test('agent switch blocks work-card creation before network or Hermes commands',async()=>{
 await assert.rejects(createDeliverableCard(did),/Agent runs are off/);
});
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
