import {execFile} from 'node:child_process';
import path from 'node:path';
import {promisify} from 'node:util';
import {paths} from './paths.ts';
const exec=promisify(execFile);
export async function probeProspectConnection(name:'notion'|'bigin'){
 if(!['notion','bigin'].includes(name))throw new Error('Unsupported connection');
 try{
  const runtime=await exec(paths.hermesBin,['--print-runtime-command'],{timeout:10000,maxBuffer:65536});
  const argv=JSON.parse(runtime.stdout) as string[];
  if(!Array.isArray(argv)||typeof argv[0]!=='string'||!path.isAbsolute(argv[0]))throw new Error();
  const result=await exec(argv[0],['-I',path.join(process.cwd(),'scripts/prospect-mcp.py'),name],{timeout:50000,maxBuffer:500000});
  const lines=result.stdout.trim().split('\n');
  const outcome=JSON.parse(lines[lines.length-1]);
  return {name,ok:outcome.ok===true,configured:outcome.configured===true,toolCount:Number(outcome.toolCount)||0,checkedAt:new Date().toISOString(),error:outcome.ok?null:outcome.error||'Connection check failed.'};
 }catch{return {name,ok:false,configured:false,toolCount:0,checkedAt:new Date().toISOString(),error:'The local Marcus OS connection check could not finish.'};}
}
