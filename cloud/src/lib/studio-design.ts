export type CreationKind = 'image' | 'carousel' | 'video';
export type Shape = '4:5' | '1:1' | '9:16' | '16:9';
export type Look = 'Big Number' | 'Editorial' | 'Cinematic';
export type Slide = { number: string; headline: string; line: string };
export const SHAPES: Record<Shape, {label:string;width:number;height:number}> = {
 '4:5':{label:'Feed',width:1080,height:1350},'1:1':{label:'Square',width:1080,height:1080},
 '9:16':{label:'Story',width:1080,height:1920},'16:9':{label:'Wide',width:1080,height:608},
};
const words=(text:string)=>text.trim().split(/\s+/).filter(Boolean);
export function validateSlide(slide:Slide) {
 const headline=words(slide.headline),line=words(slide.line);
 if(headline.length<2||headline.length>5) return 'Use 2 to 5 words in the headline.';
 if(line.length>8) return 'Keep the short line to 8 words.';
 if(words(slide.number).length+headline.length+line.length>12) return 'Use at most 12 words on one slide.';
 return null;
}
export function starterSlides(count:number):Slide[] {
 if(![4,6,8,10].includes(count)) throw Error('Choose 4, 6, 8 or 10 slides.');
 const ideas=count-2;
 return [{number:String(ideas),headline:'Ideas worth sharing',line:'A practical checklist for your next post'},
 ...Array.from({length:ideas},(_,i)=>({number:String(i+1),headline:['Start with a question','Show one clear example','Keep the next step simple','Say it in your voice','Check each claim first','Give the reader one action','Make the useful part visible','Review before you publish'][i],line:'Use your own practical advice here'})),
 {number:'Save',headline:'Keep this checklist',line:'Save these ideas for your next post'}];
}
export function draftCaption(slides:Slide[]) {return `${slides.length-2} ideas worth sharing.\n\n${slides.slice(1,-1).map((s,i)=>`${i+1}. ${s.headline}`).join('\n')}\n\nSave this checklist for your next post.`;}
export function canvasSize(shape:Shape) {return SHAPES[shape];}
export function centerCrop(sourceWidth:number,sourceHeight:number,shape:Shape) {
 if(sourceWidth<=0||sourceHeight<=0)throw Error('Invalid image size.');
 const target=SHAPES[shape],ratio=target.width/target.height;
 const width=Math.min(sourceWidth,sourceHeight*ratio),height=width/ratio;
 return {x:(sourceWidth-width)/2,y:(sourceHeight-height)/2,width,height};
}
