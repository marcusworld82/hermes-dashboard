import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStateCache} from '../cloud/src/lib/server/state-cache.mjs';

test('parallel and repeated requests share one storage read until expiry',async()=>{
 let reads=0,time=0;
 const cache=createStateCache(async()=>({version:++reads}),{now:()=>time,ttlMs:60000});
 assert.deepEqual(await Promise.all([cache.read(),cache.read()]),[{version:1},{version:1}]);
 time=59000;assert.deepEqual(await cache.read(),{version:1});assert.equal(reads,1);
 time=60000;assert.deepEqual(await cache.read(),{version:2});
});
test('storage failures are briefly cached instead of retried on every UI poll',async()=>{
 let reads=0,time=0;
 const cache=createStateCache(async()=>{reads++;throw Error('storage unavailable')},{now:()=>time,ttlMs:60000});
 await assert.rejects(cache.read(),/storage unavailable/);
 await assert.rejects(cache.read(),/storage unavailable/);assert.equal(reads,1);
 time=60000;await assert.rejects(cache.read(),/storage unavailable/);assert.equal(reads,2);
});
test('a successful save cannot be replaced by an older in-flight read',async()=>{
 let finish;
 const cache=createStateCache(()=>new Promise(resolve=>{finish=resolve}),{now:()=>0});
 const old=cache.read();await Promise.resolve();
 cache.replace({value:'new'});finish({value:'old'});await old;
 assert.deepEqual(await cache.read(),{value:'new'});
});
