import type { ResearchSource } from './business-settings.ts';
import { publicFeedUrl, readPublicFeed, parsePublicFeed, type FeedItem } from './morning-rss.ts';
export type SourceEvidence = FeedItem & { excerpt:string; evidenceType:'feed-excerpt'|'page-text'; };
export function sourceFeedUrl(source:Pick<ResearchSource,'type'|'value'>) {
 if(source.type==='rss')return publicFeedUrl(source.value).href;
 if(source.type==='subreddit'){const name=source.value.replace(/^https:\/\/(?:www\.)?reddit\.com\/r\//,'').replace(/^r\//,'').replace(/\/$/,'');if(!/^[A-Za-z0-9_]{2,40}$/.test(name))throw Error('Enter a subreddit name.');return `https://www.reddit.com/r/${name}/.rss`;}
 if(source.type==='reddit-search')return `https://www.reddit.com/search.rss?${new URLSearchParams({q:source.value,sort:'new'})}`;
 if(source.type==='youtube'){const url=publicFeedUrl(source.value);const id=/^\/(?:channel)\/(UC[A-Za-z0-9_-]{22})\/?$/.exec(url.pathname)?.[1];if(!['youtube.com','www.youtube.com'].includes(url.hostname)||!id)throw Error('Use a YouTube /channel/ URL with its channel ID. Handle resolution needs a configured connector.');return `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;}
 throw Error('This source needs an approved connector. X and Instagram are not scraped. Newsletters need a public archive URL or RSS feed.');
}
export function observedText(html:string) {return html.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|#39);/g,' ').replace(/\s+/g,' ').trim().slice(0,6000);}
export async function researchContentSources(sources:ResearchSource[],reader=readPublicFeed,now=Date.now(),sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))) {
 const enabled=sources.filter(s=>s.enabled),items:SourceEvidence[]=[],results:{id:string;source:string;status:string;count:number;error?:string}[]=[];let lastReddit=false;
 for(const source of enabled.slice(0,20)){
  try{
   if(source.type==='website'){
    const url=publicFeedUrl(source.value).href,html=await reader(url),excerpt=observedText(html),title=observedText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'Public source page').slice(0,300);
    if(excerpt.length<160)throw Error('Page has too little readable text. No article claims inferred.');
    items.push({title,link:url,source:url,sourceId:source.id,publishedAt:null,fetchedAt:now,excerpt,evidenceType:'page-text'});results.push({id:source.id,source:source.value,status:'ok',count:1});continue;
   }
   const url=await resolveSourceFeed(source,reader),reddit=url.includes('reddit.com/');if(reddit&&lastReddit)await sleep(3000);if(reddit)lastReddit=true;
   const xml=await reader(url),found=parsePublicFeed(xml,{...source,value:url},now);
   const chunks=[...xml.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi)].map(m=>m[1]);
   for(const item of found){const chunk=chunks.find(c=>c.includes(item.link)||c.includes(item.link.replaceAll('&','&amp;')))||'';const body=chunk.match(/<(?:content:encoded|description|summary|content|media:description)(?:\s[^>]*)?>([\s\S]*?)<\/(?:content:encoded|description|summary|content|media:description)>/i)?.[1]||'';items.push({...item,excerpt:observedText(body),evidenceType:'feed-excerpt'});}
   results.push({id:source.id,source:source.value,status:'ok',count:found.length});
  }catch(error){results.push({id:source.id,source:source.value,status:'error',count:0,error:error instanceof Error?error.message:'Source read failed.'});}
 }
 for(const s of enabled.slice(20))results.push({id:s.id,source:s.value,status:'skipped',count:0,error:'Maximum 20 sources per read.'});
 return {checkedAt:now,noSources:enabled.length===0,items,sources:results};
}
export async function resolveSourceFeed(source:Pick<ResearchSource,'type'|'value'>,reader=readPublicFeed){
 if(source.type!=='youtube')return sourceFeedUrl(source);
 const url=publicFeedUrl(source.value);if(!['youtube.com','www.youtube.com'].includes(url.hostname))throw Error('Use a public YouTube channel URL.');
 if(/^\/channel\/UC[A-Za-z0-9_-]{22}\/?$/.test(url.pathname))return sourceFeedUrl(source);
 if(!/^\/(?:@[A-Za-z0-9_.-]+|(?:c|user)\/[A-Za-z0-9_.-]+)\/?$/.test(url.pathname))throw Error('Use a YouTube handle, user, or channel URL.');
 url.search='';url.hash='';const html=await reader(url.href),ids=new Set<string>();
 for(const match of html.matchAll(/"channelMetadataRenderer"\s*:\s*\{[^{}]{0,12000}?"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/g))ids.add(match[1]);
 for(const match of html.matchAll(/<link\b[^>]{0,2000}>/gi)){
  if(!/\brel=["']canonical["']/i.test(match[0]))continue;
  const href=match[0].match(/\bhref=["']([^"']+)["']/i)?.[1];if(!href)continue;
  try{const canonical=new URL(href,url);if(!['youtube.com','www.youtube.com'].includes(canonical.hostname)||canonical.protocol!=='https:')continue;const id=/^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/.exec(canonical.pathname)?.[1];if(id)ids.add(id);}catch{}
 }
 if(ids.size!==1)throw Error(ids.size?'YouTube channel metadata is ambiguous. Use its /channel/ URL.':'Could not resolve a verified channel ID from the public page. Use its /channel/ URL.');
 return `https://www.youtube.com/feeds/videos.xml?channel_id=${[...ids][0]}`;
}
