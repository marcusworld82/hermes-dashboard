import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeStylePreview, previewRequestKey } from '../src/lib/carousel/previews.ts';

for (const mode of ['screenshot','creative','clone','photo','editorial']) {
  test(`${mode} has unsaved cover and inner examples`,()=>{
    const car=makeStylePreview(mode,{sampleImage:'demo_photo.png'});
    assert.equal(car.mode,mode);
    assert.equal(car.size,'3:4');
    assert.equal(car.slides.length,2);
    assert.equal(car.slides[0].kind,'cover');
    assert.equal(car.slides[1].kind,'body');
    assert.equal(car.status,'draft');
    assert.equal(car.id,'style-preview');
    assert.deepEqual(car.slides[0].images,['demo_photo.png']);
    assert.equal(car.inputs.badge,'none');
  });
}
test('selected templates and photo layouts survive previewing',()=>{
  assert.equal(makeStylePreview('creative',{template:'electro'}).template,'electro');
  assert.equal(makeStylePreview('photo',{layout:'split'}).slides[0].layout,'split');
  assert.throws(()=>makeStylePreview('creative',{template:'screenshot'}));
  assert.throws(()=>makeStylePreview('photo',{layout:'unknown'}));
  assert.throws(()=>makeStylePreview('unknown'));
});
test('clone example is explicitly configured without claiming to analyze a reference',()=>{
  const car=makeStylePreview('clone');
  assert.equal(car.clone.cover,null);
  assert.ok(car.clone.spec);
  assert.match(car.clone.spec.notes,/example/i);
});
test('preview cache key includes brand, handle, image settings and unsaved slide content',()=>{
  const car=makeStylePreview('screenshot'); const original=JSON.stringify(car);
  const a=previewRequestKey(car,0);
  assert.notEqual(a,previewRequestKey({...car,brandId:'another-brand'},0));
  assert.notEqual(a,previewRequestKey({...car,inputs:{...car.inputs,includeImages:!car.inputs.includeImages}},0));
  assert.notEqual(a,previewRequestKey({...car,slides:[{...car.slides[0],headline:'Edited'},car.slides[1]]},0));
  assert.notEqual(a,previewRequestKey(car,1));
  assert.equal(JSON.stringify(car),original);
});
