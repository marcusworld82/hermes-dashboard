import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveShippedNote } from '../src/lib/server/obsidian-ship.ts';
const item={id:'card-1',title:'Client site',kind:'Website',stage:'shipped',shippedAt:1792500000,plan:{summary:'Approved scope'},secret:'must never export'};
test('shipped note writes once and preserves later human edits',()=>{
 const vault=fs.mkdtempSync(path.join(os.tmpdir(),'vault-'));
 try {const file=saveShippedNote(vault,'Hermes/Pipeline',item,true);assert.ok(file);const text=fs.readFileSync(file,'utf8');assert.match(text,/Client site/);assert.match(text,/completed 2026-10-20/);assert.doesNotMatch(text,/must never export/);fs.appendFileSync(file,'\nHuman edits');assert.equal(saveShippedNote(vault,'Hermes/Pipeline',item,true),file);assert.match(fs.readFileSync(file,'utf8'),/Human edits/);assert.equal(fs.readdirSync(path.dirname(file)).length,1);}finally{fs.rmSync(vault,{recursive:true,force:true});}
});
test('off, unshipped and unsafe destinations never export',()=>{
 const vault=fs.mkdtempSync(path.join(os.tmpdir(),'vault-'));
 try {assert.equal(saveShippedNote(vault,'Hermes/Pipeline',item,false),null);assert.equal(saveShippedNote(vault,'Hermes/Pipeline',{...item,stage:'execute'},true),null);assert.throws(()=>saveShippedNote(vault,'../outside',item,true));fs.symlinkSync(os.tmpdir(),path.join(vault,'link'));assert.throws(()=>saveShippedNote(vault,'link',item,true));}finally{fs.rmSync(vault,{recursive:true,force:true});}
});
