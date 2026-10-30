"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState} from 'react';

const tasks=[
 {href:'/studio?kind=image',title:'Make a picture',description:'Choose an idea, look and shape.',art:'picture'},
 {href:'/studio?kind=carousel',title:'Build a carousel',description:'One idea per slide. Preview as you edit.',art:'carousel'},
 {href:'/cutline',title:'Edit a video',description:'Captions, motion and the full Cutline editor.',art:'video'},
 {href:'/social/studio',title:'Write a social post',description:'Instagram and LinkedIn drafts for your review.',art:'post'},
];
function TaskPicture({kind}:{kind:string}) {return <div aria-hidden className="guided-art"><div className={`guided-art-${kind}`}><span>{kind==='carousel'?'3':kind==='video'?'▶':kind==='post'?'Your next useful idea':'A fresh perspective'}</span>{kind==='carousel'&&<small>Ideas worth sharing</small>}</div></div>;}
export function GuidedNavigation(){
 const path=usePathname();const [expanded,setExpanded]=useState(false);
 const home=path==='/dashboard';
 if(path==='/login'||path==='/studio'||path==='/cutline')return null;
 return <section className="guided-start" aria-label="Choose your next step">
  <div className="guided-heading"><div><h2>{home?'What would you like to make?':'Need a starting point?'}</h2><p>{home?'Pick a picture below. We will guide the next steps.':'Choose a guided task, or keep using the tools below.'}</p></div>{!home&&<button aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide ideas':'Show ideas'}</button>}</div>
  {(home||expanded)&&<div className="guided-task-grid">{tasks.map(task=><Link className="guided-task" href={task.href} key={task.title}><TaskPicture kind={task.art}/><strong>{task.title}</strong><p>{task.description}</p></Link>)}</div>}
  {home&&<p className="guided-existing">Your existing workspace and all tools are still below and in the sidebar. Nothing publishes without your review.</p>}
 </section>;
}
