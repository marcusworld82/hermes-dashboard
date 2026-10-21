import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {readBoardCounts} from '../src/lib/server/board-read.ts';
test('board counters use read-only SQL and exclude archived tasks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-count-'));const file=path.join(dir,'board.db');
 const db=new DatabaseSync(file);db.exec("CREATE TABLE tasks(status TEXT,assignee TEXT);INSERT INTO tasks VALUES ('ready','jordan'),('done','jordan'),('archived','maya'),('blocked',NULL)");db.close();
 try{assert.deepEqual(readBoardCounts(file),{by_status:{blocked:1,done:1,ready:1},by_assignee:{jordan:2}});}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('task listing decodes skills and filters through bound parameters',async()=>{
 const {readBoardTasks}=await import('../src/lib/server/board-read.ts');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-task-'));const file=path.join(dir,'board.db');
 const db=new DatabaseSync(file);db.exec("CREATE TABLE tasks(id TEXT,title TEXT,body TEXT,assignee TEXT,status TEXT,priority INTEGER,created_by TEXT,created_at INTEGER,started_at INTEGER,completed_at INTEGER,result TEXT,skills TEXT,last_failure_error TEXT)");
 const insert=db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
 insert.run('t1','First',null,'jordan','ready',0,'test',1,null,null,null,'["reel-director"]',null);
 insert.run('t2','Archived',null,'maya','archived',0,'test',2,null,null,null,'[]',null);db.close();
 try{assert.equal(readBoardTasks(file).length,1);assert.deepEqual(readBoardTasks(file)[0].skills,['reel-director']);assert.equal(readBoardTasks(file,{archived:true}).length,2);assert.equal(readBoardTasks(file,{assignee:"' OR 1=1 --"}).length,0);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
