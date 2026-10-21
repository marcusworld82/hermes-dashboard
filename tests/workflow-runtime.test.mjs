import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

test('scheduled workflow creates linked cards once and releases only after graph exists', async () => {
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-workflow-test-'));
 const previous=process.cwd();
 const binary=path.join(temp,'hermes.cjs');
 fs.writeFileSync(binary,`#!/usr/bin/env node
const fs=require('fs'); const path=require('path'); const args=process.argv.slice(2); const file=path.join(process.env.HERMES_DATA_DIR,'fake-cli.json'); const data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{calls:[],tasks:[]};data.calls.push(args);
if(args[0]==='profile')console.log('  Jordan (jordan) gpt-test running - -');
else if(args.includes('boards'))console.log(JSON.stringify([{slug:'command-center'}]));
else if(args.includes('create')){if(fs.existsSync(path.join(process.env.HERMES_DATA_DIR,'pause-on-create'))){const settingsFile=path.join(process.env.HERMES_DATA_DIR,'settings.json');const settings=JSON.parse(fs.readFileSync(settingsFile,'utf8'));settings.agentRuns=false;fs.writeFileSync(settingsFile,JSON.stringify(settings));}const id='t'+(data.tasks.length+1);const task={id,title:'Test',status:'blocked',assignee:'jordan'};data.tasks.push(task);console.log(JSON.stringify(task));}
else if(args.includes('list'))console.log(JSON.stringify(data.tasks));
else if(args.includes('show')){if(fs.existsSync(path.join(process.env.HERMES_DATA_DIR,'pause-on-show'))){const settingsFile=path.join(process.env.HERMES_DATA_DIR,'settings.json');const settings=JSON.parse(fs.readFileSync(settingsFile,'utf8'));settings.agentRuns=false;fs.writeFileSync(settingsFile,JSON.stringify(settings));}console.log(JSON.stringify({task:{id:args[args.indexOf('show')+1],status:'blocked'}}));}
else console.log('{}');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data));`);
 fs.chmodSync(binary,0o755);
 fs.mkdirSync(path.join(temp,'data'));
 fs.writeFileSync(path.join(temp,'team.json'),JSON.stringify({head:'jordan',agents:[{id:'jordan',name:'Jordan',provider:'test',model:'test',fallback:{model:'test'},job:[]}],groups:[]}));
 fs.writeFileSync(path.join(temp,'data/settings.json'),JSON.stringify({agentRuns:true,headAgent:'jordan'}));
 process.env.HERMES_HOME=path.join(temp,'hermes');process.env.HERMES_BIN=binary;process.env.HERMES_DATA_DIR=path.join(temp,'data');process.chdir(temp);
 try {
  const {saveWorkflow,tickWorkflowSchedules}=await import('../src/lib/server/workflows.ts');
  const rule={enabled:true,frequency:'daily',time:'09:00',timezone:'America/New_York',weekday:1};
  await saveWorkflow({name:'Test',scheduleRule:rule,steps:[{title:'First',agent:'jordan',instructions:'check',after:[]},{title:'Second',agent:'jordan',instructions:'check',after:[0]}]});
  assert.equal((await tickWorkflowSchedules(new Date('2026-10-19T15:00:00Z'))).started.length,1);
  assert.equal((await tickWorkflowSchedules(new Date('2026-10-19T15:01:00Z'))).started.length,0);
  const state=JSON.parse(fs.readFileSync(path.join(temp,'data/fake-cli.json'),'utf8'));
  const creates=state.calls.filter(a=>a.includes('create')&&!a.includes('boards'));assert.equal(creates.length,2);
  assert.equal(creates[1][creates[1].indexOf('--parent')+1],'t1');
  assert.ok(creates.every(a=>a.includes('--idempotency-key')&&a.includes('--initial-status')));
  const firstRelease=state.calls.findIndex(a=>a.includes('unblock'));
  assert.equal(state.calls.slice(0,firstRelease).filter(a=>a.includes('create')&&!a.includes('boards')).length,2);
  state.tasks.forEach((task)=>{task.status='done';task.completed_at=1;});
  state.tasks.push({id:'root',status:'blocked'});
  fs.writeFileSync(path.join(temp,'data/fake-cli.json'),JSON.stringify(state));
  const boardDir=path.join(temp,'hermes/kanban/boards/command-center');fs.mkdirSync(boardDir,{recursive:true});
  const db=new DatabaseSync(path.join(boardDir,'kanban.db'));
  db.exec('CREATE TABLE tasks(id TEXT,title TEXT,body TEXT,assignee TEXT,status TEXT,priority INTEGER,created_by TEXT,created_at INTEGER,started_at INTEGER,completed_at INTEGER,result TEXT,skills TEXT,last_failure_error TEXT)');
  const put=db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const task of state.tasks)put.run(task.id,'Test',null,'jordan',task.status,0,'test',1,null,task.completed_at??null,null,'[]',null);
  db.close();

  const pipeline={root:{id:'root',title:'Test',idea:'Test',stage:'execute',stepTasks:{s1:'t1'},qcTask:'t2',plan:{summary:'Test',steps:[{key:'s1',title:'Test',agent:'jordan',instructions:'',dependsOn:[]}]},createdAt:1}};
  const pipelinePath=path.join(temp,'data/pipeline.json');fs.writeFileSync(pipelinePath,JSON.stringify(pipeline));
  const {listPipeline,reconcilePipeline}=await import('../src/lib/server/pipeline.ts');
  const before=fs.readFileSync(pipelinePath,'utf8');
  assert.equal((await listPipeline()).items[0].stage,'shipped');
  assert.equal(fs.readFileSync(pipelinePath,'utf8'),before,'GET must not persist completion');
  assert.deepEqual((await reconcilePipeline()).completed,['root']);
  assert.equal(JSON.parse(fs.readFileSync(pipelinePath,'utf8')).root.stage,'shipped');
  assert.deepEqual((await reconcilePipeline()).completed,[],'completion mutation is idempotent');
  const {runWorkflow,resumeWorkflow}=await import('../src/lib/server/workflows.ts');
  const pausedWorkflow=await saveWorkflow({name:'Pause guard',steps:[{title:'One',agent:'jordan',instructions:'check',after:[]}]});
  const fakeFile=path.join(temp,'data/fake-cli.json');
  const unblocks=()=>JSON.parse(fs.readFileSync(fakeFile,'utf8')).calls.filter(args=>args.includes('unblock')).length;
  const beforePause=unblocks();
  fs.writeFileSync(path.join(temp,'data/pause-on-create'),'1');
  assert.equal((await runWorkflow(pausedWorkflow.id)).started,false);
  assert.equal(unblocks(),beforePause,'switch off during graph creation prevents dispatch');
  fs.unlinkSync(path.join(temp,'data/pause-on-create'));
  fs.writeFileSync(path.join(temp,'data/settings.json'),JSON.stringify({agentRuns:true,headAgent:'jordan'}));
  fs.writeFileSync(path.join(temp,'data/pause-on-show'),'1');
  await assert.rejects(resumeWorkflow(pausedWorkflow.id),/off|paused/i);
  assert.equal(unblocks(),beforePause,'switch off during resume lookup prevents dispatch');


 } finally {process.chdir(previous);delete process.env.HERMES_HOME;delete process.env.HERMES_BIN;delete process.env.HERMES_DATA_DIR;fs.rmSync(temp,{recursive:true,force:true});}
});
