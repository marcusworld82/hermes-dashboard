'use client';
import {inputCls} from '@/components/ui';

// Postiz options for the accounts picked. Only the sections for those networks show.
export type PostOptionsValue = {
 draft:boolean;comments:string[];
 instagram:{postType:'post'|'story';trialReel:boolean;graduation:'MANUAL'|'SS_PERFORMANCE';collaborators:string[]};
 tiktok:{title:string;privacy:'PUBLIC_TO_EVERYONE'|'MUTUAL_FOLLOW_FRIENDS'|'FOLLOWER_OF_CREATOR'|'SELF_ONLY';duet:boolean;stitch:boolean;comment:boolean;autoAddMusic:boolean;method:'DIRECT_POST'|'UPLOAD'};
 linkedin:{carousel:boolean|null};
 x:{whoCanReply:'everyone'|'following'|'mentionedUsers'|'subscribers'|'verified';community:string};
 facebook:{postType:'post'|'story'};
};
export const defaultPostOptions=():PostOptionsValue=>({draft:false,comments:['',''],instagram:{postType:'post',trialReel:false,graduation:'MANUAL',collaborators:[]},tiktok:{title:'',privacy:'PUBLIC_TO_EVERYONE',duet:false,stitch:false,comment:true,autoAddMusic:false,method:'DIRECT_POST'},linkedin:{carousel:null},x:{whoCanReply:'everyone',community:''},facebook:{postType:'post'}});
// Strips empty comments before sending.
export const sendableOptions=(v:PostOptionsValue)=>({...v,comments:v.comments.map(c=>c.trim()).filter(Boolean),instagram:{...v.instagram,collaborators:v.instagram.collaborators.map(c=>c.trim().replace(/^@/,'')).filter(Boolean)},x:{...v.x,community:v.x.community.trim()}});

const Check=({label,checked,onChange,disabled,hint}:{label:string;checked:boolean;onChange:(v:boolean)=>void;disabled?:boolean;hint?:string})=><label className="flex items-start gap-2 text-sm py-1"><input type="checkbox" className="mt-1 accent-[#1a1d24]" disabled={disabled} checked={checked} onChange={e=>onChange(e.target.checked)}/><span>{label}{hint&&<span className="block text-xs text-[#6b7280]">{hint}</span>}</span></label>;
const Pick=<T extends string>({label,value,options,onChange}:{label:string;value:T;options:[T,string][];onChange:(v:T)=>void})=><label className="block text-sm py-1"><span className="text-xs text-[#6b7280]">{label}</span><select className={`${inputCls} mt-1`} value={value} onChange={e=>onChange(e.target.value as T)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
const Section=({title,children}:{title:string;children:React.ReactNode})=><div className="rounded-2xl border border-[#e8eaee] p-3"><p className="text-sm font-medium mb-1">{title}</p>{children}</div>;

export function PostOptions({value,onChange,networks,video,repeat,onRepeat}:{value:PostOptionsValue;onChange:(v:PostOptionsValue)=>void;networks:string[];video:boolean;repeat?:string;onRepeat?:(v:string)=>void}){
 const set=(patch:Partial<PostOptionsValue>)=>onChange({...value,...patch});
 const has=(re:RegExp)=>networks.some(n=>re.test(n));
 const ig=value.instagram,tt=value.tiktok;
 const noComments=networks.length>0&&networks.every(n=>/^(tiktok|youtube)/.test(n));
 return <div className="space-y-3 mb-4">
  <p className="text-xs font-medium text-[#6b7280]">Post options</p>
  {!noComments&&<Section title="Comments">
   <p className="text-xs text-[#6b7280] mb-2">Posted right after the main post. On Threads and X they become replies. TikTok, YouTube and stories skip them.</p>
   {[0,1].map(i=><textarea key={i} className={`${inputCls} min-h-16 mb-2`} placeholder={i===0?'First comment (optional)':'Second comment (optional)'} value={value.comments[i]??''} onChange={e=>{const c=[...value.comments];c[i]=e.target.value;set({comments:c});}}/>)}
  </Section>}
  {has(/^instagram/)&&<Section title="Instagram">
   <Pick label="Post as" value={ig.postType} options={[['post',video?'Reel / feed post':'Feed post'],['story','Story']]} onChange={v=>set({instagram:{...ig,postType:v,trialReel:v==='story'?false:ig.trialReel}})}/>
   <Check label="Trial reel" hint={video?'Shows to non-followers first. You decide if it goes to your followers.':'Trial reels need a single video.'} disabled={!video||ig.postType!=='post'} checked={ig.trialReel} onChange={v=>set({instagram:{...ig,trialReel:v}})}/>
   {ig.trialReel&&<Pick label="Share with followers" value={ig.graduation} options={[['MANUAL','When I choose'],['SS_PERFORMANCE','Automatically if it performs well']]} onChange={v=>set({instagram:{...ig,graduation:v}})}/>}
   <label className="block text-sm py-1"><span className="text-xs text-[#6b7280]">Collaborators (up to 3 usernames, comma separated)</span><input className={`${inputCls} mt-1`} value={ig.collaborators.join(', ')} onChange={e=>set({instagram:{...ig,collaborators:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}})} placeholder="@partner"/></label>
  </Section>}
  {has(/^tiktok/)&&<Section title="TikTok">
   <label className="block text-sm py-1"><span className="text-xs text-[#6b7280]">Title (90 characters max)</span><input maxLength={90} className={`${inputCls} mt-1`} value={tt.title} onChange={e=>set({tiktok:{...tt,title:e.target.value}})}/></label>
   <Pick label="Who can watch" value={tt.privacy} options={[['PUBLIC_TO_EVERYONE','Everyone'],['MUTUAL_FOLLOW_FRIENDS','Friends'],['FOLLOWER_OF_CREATOR','Followers'],['SELF_ONLY','Only me']]} onChange={v=>set({tiktok:{...tt,privacy:v}})}/>
   <Pick label="How to post" value={tt.method} options={[['DIRECT_POST','Post directly'],['UPLOAD','Send to my TikTok inbox to finish in the app']]} onChange={v=>set({tiktok:{...tt,method:v}})}/>
   <Check label="Allow comments" checked={tt.comment} onChange={v=>set({tiktok:{...tt,comment:v}})}/>
   {video?<><Check label="Allow duets" checked={tt.duet} onChange={v=>set({tiktok:{...tt,duet:v}})}/><Check label="Allow stitches" checked={tt.stitch} onChange={v=>set({tiktok:{...tt,stitch:v}})}/></>:<Check label="Add TikTok music to photos" checked={tt.autoAddMusic} onChange={v=>set({tiktok:{...tt,autoAddMusic:v}})}/>}
  </Section>}
  {has(/^linkedin/)&&!video&&<Section title="LinkedIn"><Check label="Show images as a swipeable carousel" checked={value.linkedin.carousel??true} onChange={v=>set({linkedin:{carousel:v}})}/></Section>}
  {has(/^x$/)&&<Section title="X">
   <Pick label="Who can reply" value={value.x.whoCanReply} options={[['everyone','Everyone'],['following','People I follow'],['mentionedUsers','Only people I mention'],['subscribers','Subscribers'],['verified','Verified accounts']]} onChange={v=>set({x:{...value.x,whoCanReply:v}})}/>
   <label className="block text-sm py-1"><span className="text-xs text-[#6b7280]">Community link (optional)</span><input className={`${inputCls} mt-1`} value={value.x.community} onChange={e=>set({x:{...value.x,community:e.target.value}})} placeholder="https://x.com/i/communities/123"/></label>
  </Section>}
  {has(/^facebook$/)&&<Section title="Facebook"><Pick label="Post as" value={value.facebook.postType} options={[['post','Feed post'],['story','Story']]} onChange={v=>set({facebook:{postType:v}})}/></Section>}
  <Section title="Delivery">
   <Check label="Save as a draft in Postiz instead of scheduling" checked={value.draft} onChange={v=>set({draft:v})}/>
   {onRepeat&&<label className="block text-sm py-1"><span className="text-xs text-[#6b7280]">Post it again on (optional, schedules a second copy)</span><input type="datetime-local" className={`${inputCls} mt-1`} value={repeat??''} onChange={e=>onRepeat(e.target.value)}/></label>}
  </Section>
 </div>;
}
