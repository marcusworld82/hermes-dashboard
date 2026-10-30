"use client";
export function BriefIdeas({ideas,onChoose,label='Start with an idea'}:{ideas:string[];onChoose:(idea:string)=>void;label?:string}){
 return <div className="brief-ideas"><p>{label}</p><div>{ideas.map((idea,i)=><button type="button" key={idea} onClick={()=>onChoose(idea)}><span aria-hidden>{i+1}</span>{idea}</button>)}</div><small>Tap to fill the draft. Edit before taking the next step.</small></div>;
}
