import test from 'node:test';
import assert from 'node:assert/strict';
import { dueSlot, validateSchedule } from '../src/lib/server/workflow-schedule.ts';
const daily={ enabled:true, frequency:'daily', time:'09:00', timezone:'America/New_York', weekday:1 };
test('daily New York schedule waits until local time and catches up that day',()=>{
 assert.equal(dueSlot(daily,new Date('2026-10-19T12:59:00Z')),null);
 assert.equal(dueSlot(daily,new Date('2026-10-19T13:00:00Z')),'2026-10-19');
 assert.equal(dueSlot(daily,new Date('2026-10-19T16:00:00Z')),'2026-10-19');
});
test('weekly schedule runs on selected day only, disabled never runs',()=>{
 assert.equal(dueSlot({...daily,frequency:'weekly'},new Date('2026-10-20T16:00:00Z')),null);
 assert.equal(dueSlot({...daily,frequency:'weekly'},new Date('2026-10-19T16:00:00Z')),'2026-10-19');
 assert.equal(dueSlot({...daily,enabled:false},new Date('2026-10-19T16:00:00Z')),null);
});
test('invalid time zone and times are rejected',()=>{
 assert.throws(()=>validateSchedule({...daily,time:'25:00'}),/time/);
 assert.throws(()=>validateSchedule({...daily,timezone:'Invalid'}),/zone/);
});
