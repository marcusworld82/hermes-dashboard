import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowDispatchIndexes,validateWorkflowGate,leadResearchTemplate} from '../src/lib/server/workflow-gates.ts';
test('research template holds all work behind human gate, even with global runs enabled',()=>{
 const steps=leadResearchTemplate.steps;
 assert.deepEqual(workflowDispatchIndexes(steps),[0]);
 assert.deepEqual(workflowDispatchIndexes(steps,[1]),[0]);
 assert.deepEqual(workflowDispatchIndexes(steps,[1,2]),[0]);
 assert.deepEqual(workflowDispatchIndexes(steps,[1,2,3]),[0,4]);
 assert.throws(()=>validateWorkflowGate(steps,1,[],[],true),/Finish/);
 assert.throws(()=>validateWorkflowGate(steps,1,[],[0],false),/confirmation/);
 assert.throws(()=>validateWorkflowGate(steps,2,[],[1],true),/earlier/);
 assert.throws(()=>validateWorkflowGate(steps,1,[1],[0],true),/already/);
 assert.doesNotThrow(()=>validateWorkflowGate(steps,1,[],[0],true));
});
test('ordinary workflow behavior remains unchanged',()=>assert.deepEqual(workflowDispatchIndexes([{after:[]},{after:[0]}]),[0,1]));
