import path from 'node:path';
import {paths} from './paths.ts';
import {prospectLibrary} from './prospect-library.ts';
import {listPipeline} from './pipeline.ts';
import {readSocialPlan} from './social-plan.ts';
import {listPostRecords} from './social-posts.ts';
import {listCarousels} from './carousels.ts';
import {readKits} from './outreach-kits-run.ts';
import {readLeadResearch} from './lead-research.ts';

// The morning briefing on Home: what needs Marcus today across prospects, pipeline and social.
const local=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export async function today(now=new Date()){
 const day=local(now);const weekEnd=local(new Date(now.getTime()+6*86400000));
 let prospects={toReview:0,needsContact:0,replies:[] as {id:string;name:string}[],approve:[] as {id:string;name:string}[],withScripts:0,error:null as string|null};
 try{
  const lib=prospectLibrary().prospects;const live=lib.filter(p=>!p.doNotContact&&!['Archived','Test contact'].includes(p.stage));const kits=readKits();
  prospects={toReview:live.filter(p=>p.stage==='To review').length,needsContact:live.filter(p=>p.stage==='Needs contact').length,
   replies:live.filter(p=>p.stage==='Replied').slice(0,8).map(p=>({id:p.id,name:p.name})),
   approve:live.filter(p=>(p.drafts as {status?:unknown}[]|undefined)?.some(d=>d.status==='draft')).slice(0,8).map(p=>({id:p.id,name:p.name})),
   withScripts:live.filter(p=>kits[p.id]).length,error:null};
 }catch(e){prospects.error=(e as Error).message;}
 const pipeline=await listPipeline();
 const plan=readSocialPlan(path.join(paths.data,'social-content-plan.json')).items;
 const cars=listCarousels();const byPlan=new Map(cars.filter(c=>c.planId).map(c=>[c.planId!,c]));
 const posts=listPostRecords().filter(r=>r.state!=='canceled');
 const planned=(from:string,to:string)=>plan.filter(p=>p.date>=from&&p.date<=to).map(p=>({id:p.id,title:p.title,format:p.format,date:p.date,carouselId:byPlan.get(p.id)?.id??null,carouselStatus:byPlan.get(p.id)?.status??null}));
 return {
  day,prospects,leadResearch:(()=>{const r=readLeadResearch();return {newToReview:r.counts.newToReview,checkedAt:r.checkedAt,error:r.error};})(),
  approvals:pipeline.items.filter(i=>i.stage==='gate').map(i=>({id:i.id,title:i.title})),
  building:pipeline.items.filter(i=>i.stage==='execute').map(i=>({id:i.id,title:i.title,progress:i.progress})),
  social:{today:planned(day,day),week:planned(day,weekEnd),scheduledToday:posts.filter(r=>local(new Date(r.when))===day).length,needsCheck:posts.filter(r=>r.state==='uncertain'||r.state==='failed').length},
 };
}
