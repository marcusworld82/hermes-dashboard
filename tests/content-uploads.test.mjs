import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-content-uploads-'));
process.env.HERMES_DATA_DIR=root;
const { receiveChunk, byteRange }=await import('../src/lib/server/content-uploads.ts');
const dir=path.join(root,'piece'); fs.mkdirSync(dir);
function packet(extra={}) {return {uploadId:randomUUID(),kind:'recording',name:'take.mp4',mime:'video/mp4',index:0,total:2,data:Buffer.from('abcdefgh').toString('base64'),...extra};}
test('chunked upload can resume and repeated final request imports only once',()=>{
 let imports=0; const p=packet();const importer=(kind,bytes,mime)=>{imports++;assert.equal(bytes.toString(),'abcdefghijklmnop');assert.equal(mime,'video/mp4');return {id:'piece'};};
 assert.equal(receiveChunk(dir,p,importer).complete,false);
 assert.equal(receiveChunk(dir,p,importer).received,1);
 const second={...p,index:1,data:Buffer.from('ijklmnop').toString('base64')};
 assert.equal(receiveChunk(dir,second,importer).complete,true);
 assert.equal(receiveChunk(dir,second,importer).complete,true);assert.equal(imports,1);
});
test('refuses traversal, changed metadata and conflicting retried chunks',()=>{
 const importer=()=>({id:'piece'});assert.throws(()=>receiveChunk(dir,packet({uploadId:'../outside'}),importer),/identifier/i);
 const p=packet();receiveChunk(dir,p,importer);
 assert.throws(()=>receiveChunk(dir,{...p,mime:'image/png'},importer),/match|media/i);
 assert.throws(()=>receiveChunk(dir,{...p,data:Buffer.from('DIFFERENT').toString('base64')},importer),/different|conflict/i);
});
test('refuses invalid, oversized or excessive upload chunks',()=>{
 for(const extra of [{data:'***'}, {data:Buffer.alloc(600000).toString('base64')},{index:-1},{total:9000}]) assert.throws(()=>receiveChunk(dir,packet(extra),()=>({})),/chunk|size|base64/i);
});
test('media ranges are bounded and invalid ranges return no partial data',()=>{
 assert.deepEqual(byteRange('bytes=10-19',100),{start:10,end:19});
 assert.deepEqual(byteRange('bytes=-10',100),{start:90,end:99});
 assert.deepEqual(byteRange('bytes=90-',100),{start:90,end:99});
 assert.throws(()=>byteRange('bytes=100-120',100),/range/i);
 assert.throws(()=>byteRange('bytes=0-2,4-8',100),/range/i);
});
test('completion recovers an abandoned process lock',()=>{
 const p=packet();receiveChunk(dir,p,()=>({}));
 const lock=path.join(dir,'uploads',p.uploadId,'complete.lock');fs.writeFileSync(lock,JSON.stringify({pid:2147483000,at:Date.now()-180000}));
 assert.equal(receiveChunk(dir,{...p,index:1},()=>({id:'recovered'})).complete,true);
});
