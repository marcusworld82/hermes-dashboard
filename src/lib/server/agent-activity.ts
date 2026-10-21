import {getAgentControlActivity} from './agent-controls.ts';
import {readJson} from './store.ts';
import type {Thread} from './chat.ts';
import fs from 'node:fs';import path from 'node:path';
import {paths} from './paths.ts';import {getAgents} from './agents.ts';import {readBoardTasks} from './board-read.ts';
type Card={id:unknown;title?:unknown;status:unknown;body?:unknown;result?:unknown;assignee?:unknown;board?:string;created_at?:unknown};
export function summarizeAgentActivity(cards:Card[],readable:boolean){
 const current=cards.find(c=>c.status==='running')??cards.find(c=>c.status==='review')??cards.find(c=>c.status==='blocked');
 const status=!readable?'Unknown':current?.status==='running'?'Working':current?.status==='review'?'Waiting for you':current?.status==='blocked'?'Waiting on a task':'Idle';
 return {status,current:current?{id:String(current.id),title:String(current.title??''),board:current.board??''}:null,cards:cards.slice(0,8).map(c=>({id:String(c.id),title:String(c.title??''),status:String(c.status),board:c.board??'',result:typeof c.result==='string'?c.result.slice(0,2000):''})),cost:null};
}
export function agentLastMessages(id:string){
 const threads=Object.values(readJson<Record<string,Thread>>('threads',{})).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,100);
 return threads.flatMap(t=>t.messages.slice(-100).filter(m=>m.role==='agent'&&m.author===id&&!m.error).map(m=>({text:m.text.slice(0,2000),at:m.at*1000,threadId:t.id}))).sort((a,b)=>b.at-a.at).slice(0,5);
}
export async function agentActivity(){const agents=await getAgents();const cards:Card[]=[];let readable=false;const errors:string[]=[];const root=path.join(paths.hermesHome,'kanban','boards');
 try{for(const board of fs.readdirSync(root)){if(!/^[a-zA-Z0-9_-]+$/.test(board))continue;try{cards.push(...readBoardTasks(path.join(root,board,'kanban.db')).map(c=>{const row=c as Record<string,unknown>;return {id:row.id,status:row.status,title:row.title,assignee:row.assignee,body:row.body,result:row.result,board};}));readable=true;}catch{errors.push(`Could not read ${board}.`);}}}catch{errors.push('No board data is available.');}
 return {checkedAt:new Date().toISOString(),errors,agents:agents.map(agent=>({...agent,activity:{...summarizeAgentActivity(cards.filter(c=>c.assignee===agent.id),readable&&errors.length===0),control:getAgentControlActivity(agent.id),lastMessages:agentLastMessages(agent.id)}}))};
}
