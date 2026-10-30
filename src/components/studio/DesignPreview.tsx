"use client";
import {useEffect,useRef,useState} from 'react';
import {studioCanvas,type Composition,type StudioBackground} from '@/lib/studio-composition';
export function DesignPreview({design,background}:{design:Composition;background?:StudioBackground}){
 const canvas=useRef<HTMLCanvasElement>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;studioCanvas(design,background).then(result=>{if(!active)return;const target=canvas.current;if(target){target.width=result.width;target.height=result.height;target.getContext('2d')?.drawImage(result,0,0);setError('');}}).catch(()=>{if(active)setError('This saved background is unavailable. Reconnect storage or remove it before exporting.');});return()=>{active=false;};},[design,background]);
 return <><canvas ref={canvas} className="studio-canvas-preview" role="img" aria-label={`${design.slide?.headline||design.idea}. ${background?'Saved illustration with editable slide text.':'Design preview.'}`}/>{error&&<p role="alert">{error}</p>}</>;
}
