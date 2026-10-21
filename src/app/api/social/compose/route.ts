import {handle} from '@/lib/server/http';
import {postizClient,cleanPostOptions} from '@/lib/server/postiz';
import {schedulePost,listPostRecords} from '@/lib/server/social-posts';
import {createHash} from 'node:crypto';
const active=new Set<string>();
export async function POST(req:Request){return handle(async()=>{
 const raw=await req.text();if(raw.length>3_500_000)throw Error('Keep media under 2 MB for this composer. Use Content Machine for larger videos.');
 const data=JSON.parse(raw);
 if(typeof data.id!=='string'||!/^compose_[a-f0-9-]{36}$/.test(data.id)||typeof data.caption!=='string'||!data.caption.trim()||data.caption.length>10000)throw Error('Add a caption before scheduling.');
 if(!Array.isArray(data.channelIds)||!data.channelIds.length||data.channelIds.length>10||data.channelIds.some((s:unknown)=>typeof s!=='string'))throw Error('Choose your accounts.');
 if(!Array.isArray(data.assets)||data.assets.length>10)throw Error('Choose up to 10 images.');
 const assets=data.assets.map((a:{data:string;mime:string;name:string})=>{
 if(!a||typeof a.data!=='string'||!['image/png','image/jpeg','image/webp'].includes(a.mime)||typeof a.name!=='string')throw Error('Use JPG, PNG, or WebP images.');
 const bytes=Buffer.from(a.data,'base64');
 const valid=a.mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):a.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid)throw Error('An image could not be read.');return {bytes,mime:a.mime,name:a.name.slice(0,100)};});
 const options=cleanPostOptions(data.options);
 const fingerprint=createHash('sha256').update(JSON.stringify({caption:data.caption,channelIds:data.channelIds,when:data.when,assets:data.assets,options})).digest('hex');
 const previous=listPostRecords().find(r=>r.carouselId===data.id);
 if(previous){if(previous.overrideReason!==fingerprint)throw Error('This draft was already submitted. Start a new post.');return previous;}
 if(active.has(data.id))throw Error('This post is being submitted. Check the calendar before trying again.');
 active.add(data.id);try{return await schedulePost({carouselId:data.id,channelIds:[...new Set(data.channelIds)] as string[],caption:data.caption,when:data.when,now:false,slides:[],assets,overrideReason:fingerprint,options},postizClient());}finally{active.delete(data.id);}
});}
