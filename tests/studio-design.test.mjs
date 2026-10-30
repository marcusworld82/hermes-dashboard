import {test} from 'node:test';
import assert from 'node:assert/strict';
import {starterSlides,validateSlide,draftCaption,canvasSize,centerCrop} from '../src/lib/studio-design.ts';
test('every carousel has exactly the claimed ideas, a hook, CTA and valid editable text',()=>{
 for(const count of [4,6,8,10]){const slides=starterSlides(count);assert.equal(slides.length,count);assert.equal(slides[0].number,String(count-2));assert.ok(draftCaption(slides).startsWith(`${count-2} ideas`));assert.equal(slides.at(-1).number,'Save');for(const slide of slides)assert.equal(validateSlide(slide),null,JSON.stringify(slide));}
});
test('overlong text is rejected rather than silently truncated',()=>{assert.ok(validateSlide({number:'1',headline:'Too many words in this long headline',line:'Hello'}));assert.ok(validateSlide({number:'1',headline:'Clear headline',line:'one two three four five six seven eight nine'}));});
test('output is 1080 wide and center cropping never stretches the source',()=>{
 for(const shape of ['4:5','1:1','9:16','16:9']){assert.equal(canvasSize(shape).width,1080);const crop=centerCrop(2000,1000,shape);assert.ok(crop.x>=0&&crop.y>=0);assert.ok(crop.width<=2000&&crop.height<=1000);assert.ok(Math.abs(crop.width/crop.height-canvasSize(shape).width/canvasSize(shape).height)<0.0001);}
});
