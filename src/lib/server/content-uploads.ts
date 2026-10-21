import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

type Packet={uploadId:string;kind:'recording'|'cover'|'video';name:string;mime:string;index:number;total:number;data:string};
const MAX_CHUNK=512*1024, MAX_TOTAL=512*1024*1024;
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');

// Each completed upload keeps a receipt, so a lost response cannot import it twice.
export function receiveChunk<T>(pieceDir:string, raw:unknown, importer:(kind:Packet['kind'],bytes:Buffer,mime:string)=>T):{received:number;complete:boolean;piece?:T}{
 const p=raw as Packet;
 if(!p||typeof p.uploadId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(p.uploadId))throw Error('Invalid upload identifier.');
 if(!['recording','cover','video'].includes(p.kind)||typeof p.name!=='string'||p.name.length>250||!['video/mp4','image/png','image/jpeg','image/webp'].includes(p.mime))throw Error('Invalid media metadata.');
 if(!Number.isInteger(p.total)||p.total<1||p.total>1024||!Number.isInteger(p.index)||p.index<0||p.index>=p.total)throw Error('Invalid chunk index or total size.');
 if(typeof p.data!=='string'||p.data.length>Math.ceil(MAX_CHUNK/3)*4||!p.data.length||p.data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(p.data))throw Error('Invalid base64 chunk.');
 const bytes=Buffer.from(p.data,'base64');if(!bytes.length||bytes.length>MAX_CHUNK||bytes.toString('base64')!==p.data)throw Error('Invalid chunk size or base64.');
 const root=path.join(pieceDir,'uploads',p.uploadId);fs.mkdirSync(root,{recursive:true});
 const receipt=path.join(root,'receipt.json');if(fs.existsSync(receipt))return {received:p.total,complete:true,piece:JSON.parse(fs.readFileSync(receipt,'utf8')) as T};
 const meta=JSON.stringify({kind:p.kind,name:p.name,mime:p.mime,total:p.total});const metaFile=path.join(root,'metadata.json');
 try{fs.writeFileSync(metaFile,meta,{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;if(fs.readFileSync(metaFile,'utf8')!==meta)throw Error('Upload metadata does not match.');}
 const part=path.join(root,`${p.index}.part`);
 try{fs.writeFileSync(part,bytes,{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;if(hash(fs.readFileSync(part))!==hash(bytes))throw Error('Retried chunk contains different data.');}
 const parts=fs.readdirSync(root).filter(s=>/^\d+\.part$/.test(s));
 if(parts.reduce((n,s)=>n+fs.statSync(path.join(root,s)).size,0)>MAX_TOTAL)throw Error('Upload exceeds the size limit.');
 if(parts.length!==p.total)return {received:parts.length,complete:false};
 const lock=path.join(root,'complete.lock');let fd:number;
 try{fd=fs.openSync(lock,'wx');}catch{
  let abandoned=false;
  try{const owner=JSON.parse(fs.readFileSync(lock,'utf8'));try{process.kill(owner.pid,0);}catch(e){abandoned=(e as NodeJS.ErrnoException).code==='ESRCH';}}catch{abandoned=Date.now()-fs.statSync(lock).mtimeMs>120000;}
  if(!abandoned)throw Error('Upload completion is busy. Retry the last chunk.');
  fs.rmSync(lock,{force:true});fd=fs.openSync(lock,'wx');
 }
 fs.writeSync(fd,JSON.stringify({pid:process.pid,at:Date.now()}));
 const assembled=path.join(root,`assembled-${randomUUID()}`);
 try{
  const out=fs.openSync(assembled,'wx',0o600);
  try{for(let i=0;i<p.total;i++)fs.writeSync(out,fs.readFileSync(path.join(root,`${i}.part`)));}finally{fs.closeSync(out);}
  const piece=importer(p.kind,fs.readFileSync(assembled),p.mime);
  fs.writeFileSync(receipt,JSON.stringify(piece),{mode:0o600});
  for(const s of parts)fs.unlinkSync(path.join(root,s));
  return {received:p.total,complete:true,piece};
 }finally{fs.rmSync(assembled,{force:true});fs.closeSync(fd);fs.rmSync(lock,{force:true});}
}

export function byteRange(header:string,size:number){
 const m=/^bytes=(\d*)-(\d*)$/.exec(header);if(!m||(!m[1]&&!m[2]))throw Error('Invalid range.');
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));const end=m[1]?(m[2]?Math.min(size-1,Number(m[2])):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw Error('Unsatisfiable range.');
 return {start,end};
}
