import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { CutlineError, validateBundle } from './cutline-cloud-core.mjs';
const fail = message => { throw new CutlineError('INVALID_DOCUMENT', message); };
const SFX = { whip: 'whoosh-heavy.mp3', zoompunch: 'whoosh.mp3', spin: 'whoosh.mp3', flash: 'click.wav', glitch: 'click.wav', shake: 'click.wav' };
const safeJSON = doc => JSON.stringify(doc).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function validateCutlineDocument(doc, availableFonts) {
  let nodes = 0;
  function visit(value, key = '', depth = 0) {
    if (++nodes > 100000 || depth > 16) fail('Document complexity limit exceeded.');
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 1000000)) fail('Numeric value out of bounds.');
    if (typeof value === 'string') {
      if (value.length > (key === 'text' ? 1000 : 256)) fail('Text value too long.');
      // Text is rendered using textContent by the unchanged engine; all other
      // strings are style/token values and cannot contain CSS/URL syntax.
      if (key !== 'text' && /[<>;{}\\]|url\s*\(|expression\s*\(|https?:|data:|javascript:/i.test(value)) fail('Unsafe style or URL value.');
      if (key === 'font' && availableFonts && !availableFonts.has(value)) fail('Font is not in the approved render bundle.');
    }
    if (value && typeof value === 'object') {
      if (Array.isArray(value) && value.length > 10000) fail('Array limit exceeded.');
      for (const [k, v] of Object.entries(value)) { if (['__proto__', 'prototype', 'constructor'].includes(k)) fail('Unsafe document key.'); visit(v, k, depth + 1); }
    } else if (!['number', 'string', 'boolean', 'undefined'].includes(typeof value) && value !== null) fail('Invalid value.');
  }
  visit(doc);
  if (!doc || !Array.isArray(doc.words) || !Array.isArray(doc.captions) || !doc.settings || !doc.video) fail('Missing document fields.');
  const { duration, w, h } = doc.video;
  if (!(duration > 0 && duration <= 120) || !Number.isInteger(w) || !Number.isInteger(h) || w < 16 || h < 16 || w > 1920 || h > 1920 || w % 2 || h % 2) fail('Maximum render is two minutes at 1920 pixels per side.');
  const wordIds = new Set();
  for (const word of doc.words) {
    if (typeof word.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(word.id) || wordIds.has(word.id) || ['__proto__', 'constructor', 'prototype'].includes(word.id) || typeof word.text !== 'string' || !(word.start >= 0 && word.end >= word.start && word.end <= duration)) fail('Invalid word timing or identifier.');
    wordIds.add(word.id);
  }
  if (doc.captions.length > 2000) fail('Too many captions.');
  for (const cap of doc.captions) if (typeof cap.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(cap.id) || ['__proto__','constructor','prototype'].includes(cap.id) || !Array.isArray(cap.wordIds) || !cap.wordIds.length || cap.wordIds.length > 100 || !cap.wordIds.every(id => wordIds.has(id))) fail('Invalid caption words.');
  for (const transition of doc.transitions || []) if (!(typeof transition.t === 'number' && transition.t >= 0 && transition.t <= duration) || (transition.dur !== undefined && !(transition.dur >= 0 && transition.dur <= 10))) fail('Invalid transition timing.');
  return doc;
}
/** Only trusted server-owned engine/GSAP/fonts/audio enter this factory. Media is
 * resolved by the server from an owned immutable revision, never a client URL. */
/** @param {{engine: Buffer, engineDigest: string, gsap: Buffer, fonts?: Array<{family: string, file: string, content: Buffer}>, audio?: Record<string, Buffer>}} options */
export function createCutlineCompiler({ engine, engineDigest, gsap, fonts = [], audio = {} }) {
  if (!Buffer.isBuffer(engine) || createHash('sha256').update(engine).digest('hex') !== engineDigest || !Buffer.isBuffer(gsap)) fail('Approved engine and bundled GSAP are required.');
  const names = new Set(fonts.map(f => f.family));
  if (!names.has('Avenir Next')) fail('The preview default font must be licensed and bundled for faithful rendering.');
  for (const f of fonts) if (!/^[a-zA-Z0-9 _-]{1,80}$/.test(f.family) || !/^[a-zA-Z0-9_-]+\.woff2$/.test(f.file) || !Buffer.isBuffer(f.content)) fail('Invalid font asset.');
  const context = vm.createContext({}); vm.runInContext(engine.toString('utf8'), context, { timeout: 1000 });
  return {
    compile(document, source) {
      const doc = validateCutlineDocument(structuredClone(document), names);
      if (!Buffer.isBuffer(source) || !source.length) fail('Owned source media is required.');
      // JSON boundary prevents cross-realm prototypes; only pure engine timing runs.
      context.__doc = JSON.parse(JSON.stringify(doc));
      const times = vm.runInContext('CaptionEngine.timings(__doc).map(x => x.start)', context, { timeout: 1000 });
      const sounds = [];
      if (doc.settings.sound === 'whoosh') times.forEach((t, i) => sounds.push({ id: `sfx${i}`, t: Math.max(0, t - 0.05), dur: 0.6, volume: 0.45, file: 'whoosh.mp3' }));
      if (doc.settings.transitionSound !== false) (doc.transitions || []).forEach((x, i) => { if (SFX[x.type]) sounds.push({ id: `tsfx${i}`, t: Math.max(0, x.t - (x.dur || 0) / 2 - 0.03), dur: SFX[x.type] === 'click.wav' ? 0.32 : 0.7, volume: 0.5, file: SFX[x.type] }); });
      const usedAudio = new Set(sounds.map(s => s.file));
      for (const file of usedAudio) if (!Buffer.isBuffer(audio[file])) fail('Required audio asset is missing.');
      const { w: W, h: H, duration: D } = doc.video;
      const fontCSS = fonts.map(f => `@font-face{font-family:"${f.family}";src:url("assets/${f.file}") format("woff2");}`).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"><script src="gsap.js"></script><script src="engine.js"></script><style>${fontCSS}*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}#cam{position:absolute;inset:0;overflow:hidden}#src{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}#fx{position:absolute;inset:0;pointer-events:none;overflow:hidden}#captions{position:absolute;inset:0;overflow:visible;pointer-events:none}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="${W}" data-height="${H}"><div id="cam"><video id="src" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-has-audio="true" src="assets/source.mp4"></video></div><div id="fx"></div><div id="captions" class="clip" data-start="0" data-duration="${D}" data-track-index="1" data-track-kind="captions" data-layout-allow-overflow data-layout-allow-overlap></div>${sounds.map(s => `<audio id="${s.id}" class="clip" data-start="${s.t.toFixed(3)}" data-duration="${s.dur}" data-volume="${s.volume}" src="assets/${s.file}"></audio>`).join('')}</div><script>const DOC=${safeJSON(doc)};const host=document.getElementById('captions'),cam=document.getElementById('cam'),fxl=document.getElementById('fx'),clock={t:0};window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.to(clock,{t:${D},duration:${D},ease:'none',onUpdate:()=>{CaptionEngine.renderVideo(cam,fxl,DOC,clock.t);CaptionEngine.render(host,DOC,clock.t);}},0);document.fonts.ready.then(()=>{CaptionEngine.renderVideo(cam,fxl,DOC,0);CaptionEngine.render(host,DOC,0);});window.__timelines.main=tl;tl.seek(0);</script></body></html>`;
      return validateBundle([{ rel: 'index.html', content: Buffer.from(html) }, { rel: 'engine.js', content: engine }, { rel: 'gsap.js', content: gsap }, { rel: 'assets/source.mp4', content: source }, ...fonts.map(f => ({ rel: `assets/${f.file}`, content: f.content })), ...[...usedAudio].map(file => ({ rel: `assets/${file}`, content: audio[file] }))]);
    },
  };
}
