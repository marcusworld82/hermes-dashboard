import test from 'node:test';
import assert from 'node:assert/strict';
import {planProspectPromotion} from '../src/lib/server/prospect-promotion.ts';
const empty=()=>({companies:[],people:[],evidence:[]});
const row=(id,overrides={})=>({id,sourceIds:'lead:'+id,name:'Business '+id,email:id+'@example.com',phone:'',notionUrl:'https://notion.so/'+id,doNotContact:false,stage:'To review',links:[],research:[],...overrides});
test('promotion preserves source identity and never creates sending approval',()=>{
 const rows=[row('one',{links:[{label:'Website',url:'https://www.example.com/store'}],drafts:[{status:'draft',subject:'Review me',body:'Draft only'}]})];
 const original=structuredClone(rows);const result=planProspectPromotion(['one'],rows,empty());
 assert.equal(result.records.companies[0].stable_id,'co:domain:example.com');assert.equal(result.records.companies[0].stage,'New');assert.equal(result.records.companies[0].confidence,'Low');
 assert.match(result.records.evidence[0].observation,/lead:one/);assert.deepEqual(rows,original);assert.equal(result.records.companies[0].approved,undefined);
 const repeat=planProspectPromotion(['one'],rows,{...empty(),evidence:[{stableId:result.records.evidence[0].stable_id}]});assert.equal(repeat.records.companies.length,0);
});
test('suppression is checked across library and all duplicate identifiers',()=>{
 const rows=[row('one'),row('two',{email:'one@example.com'}),row('dnc',{email:'one@example.com',doNotContact:true})];
 assert.equal(planProspectPromotion(['one','two'],rows,empty()).records.companies.length,0);
 assert.equal(planProspectPromotion(['one'],[row('one')],{...empty(),people:[{email:'ONE@example.com',phone:'',stage:'Do not contact'}]}).records.companies.length,0);
 const phoneRows=[row('one',{email:'',phone:'2165551234'}),row('two',{email:'',phone:'+1 (216) 555-1234'})];assert.equal(planProspectPromotion(['one','two'],phoneRows,empty()).records.companies.length,1);
});
test('contacted and replied state preserved and selected malformed inputs rejected',()=>{
 const rows=[row('one',{stage:'Contacted'}),row('two',{stage:'Replied'})];
 assert.deepEqual(planProspectPromotion(['one','two'],rows,empty()).records.companies.map(row=>row.stage),['Sent','Replied']);
 assert.throws(()=>planProspectPromotion(['one','one'],rows,empty()),/unique/);
 assert.throws(()=>planProspectPromotion(['missing'],rows,empty()),/no longer/);
});
test('same business name never deduplicates separate contacts',()=>{
 const rows=[row('one',{name:'Shared name'}),row('two',{name:'Shared name'})];assert.equal(planProspectPromotion(['one','two'],rows,empty()).records.companies.length,2);
});
test('shared legacy source IDs deduplicate and carry suppression even if contacts changed',()=>{
 const rows=[row('one',{sourceIds:'legacy:shared'}),row('two',{sourceIds:'legacy:shared'})];
 assert.equal(planProspectPromotion(['one','two'],rows,empty()).records.companies.length,1);
 rows[1].doNotContact=true;assert.equal(planProspectPromotion(['one'],rows,empty()).records.companies.length,0);
});
