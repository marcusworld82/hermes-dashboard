import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReceipt} from '../src/lib/server/prospect-library.ts';
const page=(id,source,extra={})=>({id,url:`https://www.notion.so/${id}`,properties:{Name:'Business','Source IDs':source,...extra}});
test('preserves no-email prospects and does not merge agents at one business',()=>{
 const rows=normalizeReceipt({pages:[page('a','prospect:1'),page('b','prospect:2')]});
 assert.equal(rows.length,2); assert.equal(rows[0].email,''); assert.equal(rows[0].biginId,'');
});
test('suppression stays explicit and checked strings are recognized',()=>{
 const rows=normalizeReceipt({pages:[page('a','lead:1',{'Do not contact':'__YES__'}),page('b','lead:2',{'Do not contact':'__NO__'})]});
 assert.equal(rows[0].doNotContact,true); assert.equal(rows[1].doNotContact,false);
});
test('duplicate source mapping fails instead of silently merging',()=>{
 assert.throws(()=>normalizeReceipt({pages:[page('a','lead:1'),page('b','lead:1')]}),/Duplicate/);
});
test('untrusted URLs are not exposed as clickable links',()=>{
 const rows=normalizeReceipt({pages:[{...page('a','lead:1'),url:'javascript:alert(1)'}]});
 assert.equal(rows[0].notionUrl,'');
});

test('supports Notion app page links returned in migration receipts',()=>{
 const rows=normalizeReceipt({pages:[{...page('a','lead:1'),url:'https://app.notion.com/p/3fe8226e3aa58157a10bf2015f8ae87c?pvs=204'}]});
 assert.equal(rows[0].notionUrl,'https://app.notion.com/p/3fe8226e3aa58157a10bf2015f8ae87c?pvs=204');
});
