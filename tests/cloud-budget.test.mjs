import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSyncBudget, SNAPSHOT_INTERVAL_MS} from '../scripts/cloud-sync-budget.mjs';

test('frequently changing snapshots stay below 2000 monthly writes',()=>{
 let time=0,writes=0;
 const budget=createSyncBudget({now:()=>time});
 for(;time<31*86400000;time+=120000){if(budget.canUpload()){writes++;budget.uploaded();}}
 assert.equal(writes,1488);
});
test('restarting the bridge preserves the remaining snapshot cooldown',()=>{
 let time=Date.parse('2026-10-30T00:10:00Z');
 const budget=createSyncBudget({now:()=>time,lastSyncedAt:'2026-10-30T00:00:00Z'});
 assert.equal(budget.canUpload(),false);
 time+=20*60000;
 assert.equal(budget.canUpload(),true);
});
test('storage failures back off both registration and snapshot retries',()=>{
 let time=0;
 const budget=createSyncBudget({now:()=>time});
 budget.registrationFailed();budget.uploadFailed();
 assert.equal(budget.canRegister(),false);assert.equal(budget.canUpload(),false);
 time=SNAPSHOT_INTERVAL_MS;
 assert.equal(budget.canRegister(),true);assert.equal(budget.canUpload(),true);
});
