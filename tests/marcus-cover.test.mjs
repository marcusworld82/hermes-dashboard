import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.HERMES_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-cover-jobs-'));
const {buildMarcusCoverRequest}=await import('../src/lib/server/marcus-covers.ts');
const {createCarousel,getCarousel,updateCarousel,newSlide}=await import('../src/lib/server/carousels.ts');
const {startCoverJob,getCoverJob}=await import('../src/lib/server/cover-jobs.ts');
const {codexPrompt}=await import('../src/lib/server/images-codex.ts');
const {makeStylePreview}=await import('../src/lib/carousel/previews.ts');

function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cover-system-'));const skill=path.join(dir,'skill'),brand=path.join(dir,'brand');fs.mkdirSync(path.join(skill,'references'),{recursive:true});fs.mkdirSync(path.join(skill,'assets'),{recursive:true});fs.mkdirSync(path.join(brand,'Brand/11 Laws of Marketing'),{recursive:true});
 for(const [name,text]of[['SKILL.md','Marcus Carousel Covers, preserve identity'],['references/styles.md','| 5 | Keep | [Chartreuse](../assets/05-reference.png) | collage | process |'],['assets/05-reference.png','image'],['assets/marcus-character-sheet.png','identity']])fs.writeFileSync(path.join(skill,name),text);
 for(const f of ['LWM PERSONAL BRAND FOUNDATION','Brand/Marcus Collins Personal Brand Kit.md','Brand/11 Laws of Marketing/Marketing Laws and Content Rules.md'])fs.writeFileSync(path.join(brand,f),'Approved fixture business context.');return{skillDir:skill,brandDir:brand};}

test('cover prompt loads the saved skill, current identity and selected style, with exact supplied text',()=>{
 const c=makeStylePreview('screenshot');const r=buildMarcusCoverRequest(c,5,'Working at a desk',fixture());assert.equal(r.references.length,2);assert.match(r.references[0],/marcus-character-sheet/);assert.match(r.references[1],/05-reference/);assert.match(r.prompt,/Marcus Carousel Covers/);assert.ok(r.prompt.includes(c.slides[0].headline.replace(/\*/g,'')));assert.match(r.prompt,/No paid|no paid/);assert.match(r.prompt,/Working at a desk/);assert.throws(()=>buildMarcusCoverRequest(c,6,'',fixture()),/saved style/);
});
test('finished cover prompt permits integrated text instead of the photo-only no-words rule',()=>{
 assert.match(codexPrompt('Headline: HELLO','3:4','cover'),/finished cover/);assert.doesNotMatch(codexPrompt('Headline: HELLO','3:4','cover'),/Do not put any words/);
});
test('a generated cover attaches independently and preserves inner edits',async()=>{
 const car=createCarousel({mode:'screenshot',slides:[newSlide({kind:'cover',headline:'My hook'}),newSlide({body:'Original'})]});let finish;const generated=new Promise(r=>finish=r);const job=startCoverJob(car,5,'',{request:{prompt:'fixture',references:[]},generate:()=>generated});const dup=startCoverJob(car,5,'',{request:{prompt:'fixture',references:[]},generate:()=>{throw Error('duplicate model call')}});assert.equal(dup.id,job.id);
 const fresh=getCarousel(car.id);updateCarousel(car.id,{slides:[fresh.slides[0],{...fresh.slides[1],body:'Edited while generating'}]});finish({file:'new_cover.png'});await new Promise(setImmediate);const ready=getCoverJob(job.id);assert.equal(ready.status,'ready');assert.equal(ready.attached,true);assert.equal(getCarousel(car.id).cover.image,'new_cover.png');assert.equal(getCarousel(car.id).slides[1].body,'Edited while generating');
});
test('a new uploaded cover wins over a pending generation',async()=>{
 const car=createCarousel({slides:[newSlide({kind:'cover',headline:'Hook'})]});let finish;const job=startCoverJob(car,5,'',{request:{prompt:'fixture',references:[]},generate:()=>new Promise(r=>finish=r)});updateCarousel(car.id,{cover:{image:'uploaded.png',source:'upload',fit:'contain'}});finish({file:'generated.png'});await new Promise(setImmediate);assert.equal(getCoverJob(job.id).attached,false);assert.equal(getCarousel(car.id).cover.image,'uploaded.png');
});
