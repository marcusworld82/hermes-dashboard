// Server only. Returns a private subprocess environment. Never serialize this object.
import fs from 'node:fs';
import path from 'node:path';
import { createDecipheriv } from 'node:crypto';
import { paths } from './paths.ts';
import { dotenvValue } from './models.ts';
const names=['SCRAPEGRAPH_BACKEND','SCRAPEGRAPH_MODEL','SCRAPEGRAPH_MODEL_API_KEY','OPENROUTER_API_KEY','OPENROUTER_MODEL','OPENAI_API_KEY','CONNECTIONS_MASTER_KEY'] as const;
export function researchEnvironment():NodeJS.ProcessEnv {
 const values:Record<string,string|undefined>={};
 for(const file of [path.join(paths.hermesHome,'.env'),path.join(paths.crmDir,'.env.local')]){
  if(!fs.existsSync(file))continue;const raw=fs.readFileSync(file,'utf8');for(const name of names){const value=dotenvValue(raw,name);if(value)values[name]=value;}
 }
 for(const name of names)if(process.env[name])values[name]=process.env[name];
 const configuredBackend=values.SCRAPEGRAPH_BACKEND||'claude-code';
 if(configuredBackend==='claude-code')return {...process.env,SCRAPEGRAPH_BACKEND:'claude-code',SCRAPEGRAPH_MODEL:'claude-code-subscription'};
 const encrypted=path.join(paths.crmDir,'data/credentials/providers.enc');
 if(fs.existsSync(encrypted)&&values.CONNECTIONS_MASTER_KEY){
  const stat=fs.lstatSync(encrypted);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>65536||(stat.mode&0o077)!==0)throw new Error('ScrapeGraph private credential storage needs review.');
  try{const j=JSON.parse(fs.readFileSync(encrypted,'utf8'));if(j.v!==1)throw new Error();const d=createDecipheriv('aes-256-gcm',Buffer.from(values.CONNECTIONS_MASTER_KEY,'hex'),Buffer.from(j.iv,'base64'));d.setAuthTag(Buffer.from(j.tag,'base64'));const v=JSON.parse(Buffer.concat([d.update(Buffer.from(j.ciphertext,'base64')),d.final()]).toString('utf8'));if(v.SCRAPEGRAPH_MODEL_API_KEY)values.SCRAPEGRAPH_MODEL_API_KEY=v.SCRAPEGRAPH_MODEL_API_KEY;if(v.OPENROUTER_API_KEY&&!values.OPENROUTER_API_KEY)values.OPENROUTER_API_KEY=v.OPENROUTER_API_KEY;}catch{throw new Error('ScrapeGraph private credentials could not be opened.');}
 }
 // The verified subscription extractor is the default. API extraction remains an explicit configured backend.
 const backend=configuredBackend;
 const model=values.SCRAPEGRAPH_MODEL||(backend==='openrouter'?(values.OPENROUTER_MODEL||'google/gemma-4-31b-it:free'):undefined);
 const key=values.SCRAPEGRAPH_MODEL_API_KEY||(backend==='openrouter'?values.OPENROUTER_API_KEY:values.OPENAI_API_KEY);
 if(!['openai','openrouter'].includes(backend)||!model||!key||! /^[a-zA-Z0-9][a-zA-Z0-9._/:-]{0,159}$/.test(model))throw new Error('ScrapeGraph needs its configured backend, model and private API credential.');
 return {...process.env,SCRAPEGRAPH_BACKEND:backend,SCRAPEGRAPH_MODEL:model,SCRAPEGRAPH_MODEL_API_KEY:key};
}
