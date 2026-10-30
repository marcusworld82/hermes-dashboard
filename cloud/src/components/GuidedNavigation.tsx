"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState} from 'react';
import {routeGuide} from '@/lib/guided-tasks';
export function GuidedNavigation(){
 const path=usePathname(),[expanded,setExpanded]=useState(false);if(path==='/login'||path==='/studio'||path==='/cutline')return null;
 const guide=routeGuide(path),home=path==='/dashboard';
 return <section className="guided-start" aria-label="Choose your next step"><div className="guided-heading"><div><p className="guided-eyebrow">START HERE</p><h2>{guide.title}</h2><p>{guide.purpose}</p></div>{!home&&<button aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide starting choices':'Show starting choices'}</button>}</div><ol className="guided-steps">{guide.steps.map((step,i)=><li key={step}><span>{i+1}</span>{step}</li>)}</ol>{(home||expanded)&&<div className="guided-task-grid">{guide.links.map((task,i)=><Link className="guided-task" href={task.href} key={task.href}><div aria-hidden className="guided-art"><div className={`guided-art-${task.art}`}><span>{home?(i===0?'▰':i===1?'1 2 3':i===2?'▶':'Aa'):String(i+1).padStart(2,'0')}</span></div></div><strong>{task.label}</strong><p>{task.detail}</p></Link>)}</div>}</section>;
}
