import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeStylePreview } from '../src/lib/carousel/previews.ts';
import { templatesFor } from '../src/lib/carousel/templates.ts';
import { screenshotLayout } from '../src/lib/carousel/screenshot.ts';
import { finishedCoverForSlide, coverMayAttach } from '../src/lib/carousel/covers.ts';
import { fitText } from '../src/lib/carousel/layout.ts';

test('screenshot offers text-only and text-with-image templates',()=>{
 assert.deepEqual(templatesFor('screenshot').map(t=>t.id),['screenshot','screenshot-image']);
 const text=makeStylePreview('screenshot',{template:'screenshot',sampleImage:'photo.png'});
 const image=makeStylePreview('screenshot',{template:'screenshot-image',sampleImage:'photo.png'});
 assert.equal(text.inputs.includeImages,false);
 assert.equal(image.inputs.includeImages,true);
 assert.equal(screenshotLayout(text,text.slides[0],false).imageHeight,0);
 assert.ok(screenshotLayout(image,image.slides[0],true).imageHeight>0);
});
test('more copy or an image reduces the screenshot font size within its floor',()=>{
 const c=makeStylePreview('screenshot'); const short=screenshotLayout(c,c.slides[0],false);
 const long=screenshotLayout(c,{...c.slides[0],body:'More detail. '.repeat(60)},false);
 const photo=screenshotLayout({...c,template:'screenshot-image'},c.slides[0],true);
 assert.ok(long.px<short.px);assert.ok(long.px>=36);assert.ok(photo.availableTextHeight<short.availableTextHeight);
 assert.equal(screenshotLayout(c,{...c.slides[0],body:'word '.repeat(1000)},false).fits,false);
});
test('line breaks and blank paragraphs count toward fit height',()=>{
 const opts={box:{w:910,h:250},maxPx:62,minPx:36,lineHeight:1.3,charWidth:.55};
 const one=fitText('one two three four five',opts);
 const lines=fitText('one\n\ntwo\n\nthree\n\nfour\n\nfive',opts);
 assert.ok(lines.px<one.px);assert.equal(lines.fits,false);
});
test('a finished cover applies only to slide one, without changing the inner template',()=>{
 const c=makeStylePreview('screenshot'); const original=JSON.stringify(c);
 const custom={...c,cover:{image:'finished.png',source:'upload',fit:'contain'}};
 assert.equal(finishedCoverForSlide(custom,0).image,'finished.png');assert.equal(finishedCoverForSlide(custom,1),null);
 assert.equal(custom.mode,'screenshot');assert.deepEqual(custom.slides,c.slides);assert.equal(JSON.stringify(c),original);
});
test('a background job never replaces a newer upload or a changed first slide',()=>{
 const c=makeStylePreview('screenshot');
 assert.equal(coverMayAttach(c,c),true);
 assert.equal(coverMayAttach({...c,cover:{image:'new.png',source:'upload',fit:'contain'}},c),false);
 assert.equal(coverMayAttach({...c,slides:[{...c.slides[0],headline:'New hook'},c.slides[1]]},c),false);
});
