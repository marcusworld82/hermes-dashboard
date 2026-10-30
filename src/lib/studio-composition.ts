import {centerCrop,SHAPES,type Shape,type Look,type Slide} from './studio-design.ts';
export type StudioBackground={jobId:string;outputIndex:number;downloadUrl:string};
export function savedBackground(jobId:string,outputIndex:number):StudioBackground {
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(jobId)||!Number.isSafeInteger(outputIndex)||outputIndex<0||outputIndex>19)throw new Error('Choose a saved Studio image.');
 return {jobId,outputIndex,downloadUrl:`/api/creative-studio/jobs/${jobId}/outputs/${outputIndex}`};
}
export function validBackground(value:unknown):value is StudioBackground {
 if(!value||typeof value!=='object')return false;
 const v=value as StudioBackground;try{return savedBackground(v.jobId,v.outputIndex).downloadUrl===v.downloadUrl;}catch{return false;}
}
export type Composition={shape:Shape;look:Look;idea:string;slide?:Slide;index:number;total:number};
/** One deterministic renderer drives the preview and exported PNG. Backgrounds
 * are authenticated normalized Studio artifacts, never arbitrary remote URLs. */
export function paintStudio(ctx:CanvasRenderingContext2D,design:Composition,image?:CanvasImageSource & {width:number;height:number}){
 const size=SHAPES[design.shape],w=size.width,h=size.height,dark=design.look==='Cinematic'||!!image;
 ctx.clearRect(0,0,w,h);ctx.fillStyle=dark?'#000000':'#ffffff';ctx.fillRect(0,0,w,h);
 if(image){const crop=centerCrop(image.width,image.height,design.shape);ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,w,h);ctx.fillStyle='rgba(0,0,0,0.66)';ctx.fillRect(0,0,w,h);}
 ctx.textAlign='left';ctx.fillStyle='#dc2626';ctx.fillRect(64,64,100,8);ctx.font='600 24px sans-serif';ctx.fillText('LYFE WITH MARCUS',64,116);
 const number=design.slide?.number||'Your idea';ctx.font=`700 ${Math.min(140,Math.floor(w/(Math.max(2,number.length)*.65)))}px ${design.look==='Editorial'?'Georgia':'sans-serif'}`;ctx.fillText(number,64,h*.34);
 ctx.fillStyle=dark?'#ffffff':'#000000';
 const wrap=(text:string,y:number,font:string,lineHeight:number)=>{ctx.font=font;let line='';for(const word of text.trim().split(/\s+/)){const next=(line+' '+word).trim();if(ctx.measureText(next).width>w-128&&line){ctx.fillText(line,64,y);y+=lineHeight;line=word;}else line=next;}ctx.fillText(line,64,y);return y+lineHeight;};
 const y=wrap(design.slide?.headline||design.idea,h*.49,`700 ${h<800?44:60}px ${design.look==='Editorial'?'Georgia':'sans-serif'}`,h<800?52:74);
 if(design.slide)wrap(design.slide.line,y+16,'400 34px sans-serif',44);
 ctx.font='400 24px sans-serif';ctx.fillText('@lyfe.with.marcus',64,h-48);ctx.textAlign='right';ctx.fillText(design.slide?`${design.index+1} / ${design.total}`:design.shape,w-64,h-48);
 if(design.slide&&design.index===0)ctx.fillText('Swipe →',w-64,h-88);
}
export async function studioCanvas(design:Composition,background?:StudioBackground){
 const canvas=document.createElement('canvas');const size=SHAPES[design.shape];canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('This browser cannot draw the design.');
 let image:HTMLImageElement|undefined;
 if(background){if(!validBackground(background))throw new Error('Saved background is invalid.');image=new Image();image.decoding='async';image.src=background.downloadUrl;await image.decode();}
 paintStudio(ctx,design,image);return canvas;
}
