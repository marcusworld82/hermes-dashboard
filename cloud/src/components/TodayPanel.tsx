'use client';
import Link from 'next/link';
import {useApi} from '@/lib/client';
import {Badge, Card} from '@/components/ui';

// Home's morning briefing. Every row links to the page where Marcus acts on it.
type Item={id:string;name?:string;title?:string};
type Planned={id:string;title:string;format:string;date:string;carouselId:string|null;carouselStatus:string|null};
type Today={day:string;leadResearch?:{newToReview:number;checkedAt:string|null;error:string|null};prospects:{toReview:number;needsContact:number;replies:Item[];approve:Item[];withScripts:number;error:string|null};approvals:Item[];building:{id:string;title:string;progress:number}[];social:{today:Planned[];week:Planned[];scheduledToday:number;needsCheck:number}};

function Box({title,href,count,children}:{title:string;href:string;count:number|string;children?:React.ReactNode}){
 return <Card className="p-5"><div className="flex items-center justify-between mb-3"><Link href={href} className="font-semibold hover:underline">{title}</Link><span className="text-2xl font-semibold">{count}</span></div>{children}</Card>;
}
const Row=({href,children}:{href:string;children:React.ReactNode})=><Link href={href} className="block text-sm py-1.5 border-t border-[#f0f1f3] truncate hover:underline">{children}</Link>;

export function TodayPanel(){
 const {data}=useApi<Today>('/api/today',30000);
 if(!data)return null;
 const s=data.social;
 const unmade=s.week.filter(x=>(/^(carousel|post|static|single)$/i.test(x.format)||/^(carousel|static)/i.test(x.title))&&!x.carouselId);
 return <section className="mb-6">
  <h2 className="font-semibold text-lg mb-3">Today</h2>
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
   <Box title="Lead research" href="/leads" count={data.leadResearch?.newToReview??0}><p className="text-sm text-[#6b7280]">{data.leadResearch?.error??(data.leadResearch?.checkedAt?"New leads to review in Notion.":"Waiting for the first Notion refresh.")}</p></Box>
   <Box title="Needs your approval" href="/pipeline" count={data.approvals.length}>
    {data.approvals.length?data.approvals.slice(0,5).map(a=><Row key={a.id} href="/pipeline">{a.title}</Row>):<p className="text-sm text-[#6b7280]">Nothing waiting at the Human Gate.</p>}
    {data.building.length>0&&<p className="text-xs text-[#6b7280] mt-2">{data.building.length} project{data.building.length>1?'s':''} building.</p>}
   </Box>
   <Box title="Posting today" href="/social" count={s.today.length}>
    {s.today.map(x=><Row key={x.id} href={x.carouselId?`/social/carousels?id=${x.carouselId}`:'/social'}><Badge tone={x.carouselStatus==='scheduled'?'green':x.carouselId?'blue':'amber'}>{x.carouselStatus??(x.carouselId?'in progress':'not made')}</Badge> {x.title}</Row>)}
    <p className="text-xs text-[#6b7280] mt-2">{s.scheduledToday} scheduled in Postiz today{s.needsCheck?` · ${s.needsCheck} need a check`:''}{unmade.length?` · ${unmade.length} carousels/statics this week not started`:''}</p>
   </Box>
  </div>
 </section>;
}
