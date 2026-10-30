import { readFile } from 'node:fs/promises';
/** Injected into the served document, never stored in vendor files. Keep data out
 * of this executable string; project/title/text arrive through authenticated JSON. */
export function cutlineCloudEditorBridge() {
  const native = window.fetch.bind(window); const titles = new Map(); const revisions = new Map(); let pending = Promise.resolve(); let dirty = false; let dirtyEpoch = 0; let savedEpoch = 0; let activeProject = null; let conflict = false;
  const banner = message => { let el = document.getElementById('cloud-save-status'); if (!el) { el = document.createElement('div'); el.id = 'cloud-save-status'; Object.assign(el.style, { position: 'fixed', bottom: '0', left: '0', right: '0', background: '#111', color: '#fff', borderTop: '2px solid #e5252a', padding: '8px 16px', zIndex: '9999', font: '13px sans-serif' }); el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = message; };
  async function json(path, options = {}) { const response = await native('/api/cutline-cloud/' + path, options); if (!response.ok) { let data; try { data = await response.json(); } catch {} throw Error(data?.error || data?.message || 'Cloud request failed.'); } return response.json(); }
  const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  window.__cutlineCloudMarkDirty = () => { dirty = true; dirtyEpoch++; };
  async function save(id, document, epoch) {
    if (conflict) throw Error('A revision conflict needs a reload. Keep a copy of unsaved changes before leaving.');
    dirty = true; banner('Saving private cloud revision…');
    try { const result = await json('projects/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: revisions.get(id), doc: document }) }); revisions.set(id, result.revision); savedEpoch = Math.max(savedEpoch, epoch); dirty = savedEpoch < dirtyEpoch; banner((dirty ? 'Revision saved; newer edits are pending. ' : 'Saved privately. ') + ' Cloud transcription, Apple face detection, speaker detection and translation are unavailable; import captions or edit them manually.'); return result; }
    catch (error) { if (/revision|reload|newer/i.test(error.message)) conflict = true; banner('NOT SAVED: ' + error.message + ' Keep the editor open.'); throw error; }
  }
  const queueSave = (id, value) => { const epoch = dirtyEpoch; const operation = pending.catch(() => {}).then(() => save(id, value, epoch)); pending = operation; return operation; };
  window.fetch = async (input, options = {}) => {
    let url = typeof input === 'string' ? input : input.url; const parsed = new URL(url, location.origin); url = parsed.pathname;
    const prefix = '/api/cutline/runtime/api/'; const short = url.startsWith(prefix) ? url.slice(prefix.length) : url.startsWith('/api/') ? url.slice(5) : null;
    try {
      if (short === 'projects') { const list = (await json('projects')).projects; for (const project of list) titles.set(project.id,project.title); return response(list.map(p => p.id)); }
      if (short === 'fonts') return response((await json('fonts')).fonts || []);
      if (short === 'styles' || short === 'layouts') { const result = await json('library/' + short, options.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: options.body } : {}); return response(options.method === 'POST' ? { ok: true } : result.items); }
      if (short === 'new') { const current = window.__cutlineCloudDoc?.(); if (current?.id) await queueSave(current.id, structuredClone(current)); banner('Uploading MP4 privately. Automatic transcription is unavailable; import an SRT, VTT or timed JSON afterward.'); const result = await json('projects?name=' + encodeURIComponent(parsed.searchParams.get('name') || 'Video'), { method: 'POST', headers: { 'Content-Type': options.body?.type || 'video/mp4' }, body: options.body }); return response({ id: result.id }); }
      const project = /^project\/([a-zA-Z0-9_-]+)(?:\/([a-z]+))?$/.exec(short || '');
      if (project) {
        const [, id, action] = project;
        if (!action && options.method !== 'POST') { const result = await json('projects/' + id); revisions.set(id, result.revision); activeProject = id; return response(result.doc); }
        if (!action) { const document = JSON.parse(options.body); await queueSave(id, document); return response({ ok: true }); }
        if (action === 'srt') { const live = window.__cutlineCloudDoc?.(); if (live?.id === id) await queueSave(id, structuredClone(live)); else await pending; const download = await native('/api/cutline-cloud/projects/' + id + '/srt'); if (!download.ok) throw Error('SRT export failed.'); const blob = await download.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'captions.srt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return response({ file: 'captions.srt (downloaded)' }); }
        if (action === 'render') { const review = await json('status'); if (!review.canRender || !review.budget?.perJobCents || !review.budget?.dailyCents) throw Error('Cloud rendering and its budget are not configured.'); if (!window.confirm('Render one private MP4?\nPer-job maximum: $' + (review.budget.perJobCents / 100).toFixed(2) + '\nDaily maximum: $' + (review.budget.dailyCents / 100).toFixed(2) + '\nEach attempt reserves the full per-job amount. No automatic paid retry.')) return response({ ok: false, error: 'Render cancelled before dispatch.' }); await queueSave(id, JSON.parse(options.body)); const queued = await json('jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: id, revision: revisions.get(id), requestId: crypto.randomUUID() }) }); banner('Cloud render explicitly dispatched. No automatic paid retry. Keep this tab open for its result.'); const result = await json('jobs/' + queued.job.id + '/dispatch', { method: 'POST' }); if (result.job.state !== 'succeeded') return response({ ok: false, error: result.job.errorCode || result.job.state }); const a = document.createElement('a'); a.href = result.job.downloadPath; a.textContent = 'Download private MP4'; a.target = '_blank'; const status = document.getElementById('cloud-save-status'); status.textContent = 'Render ready: '; status.appendChild(a); return response({ ok: true, downloadPath: result.job.downloadPath }); }
        throw Error('This operation needs the Mac service: ' + action + '. Your existing edit data is preserved.');
      }
      if (url.startsWith('/api/cutline/runtime/assets/')) return native('/api/cutline-cloud/assets/' + encodeURIComponent(url.split('/').pop()), options);
      // Never let a missed legacy request reach an unrelated Hermes API/proxy.
      if (url.startsWith('/api/cutline/runtime/') || (short && !short.startsWith('cutline-cloud/'))) throw Error('This local Cutline operation is not supported in cloud editing.');
      return native(input, options);
    } catch (error) { banner('Cloud operation failed: ' + error.message); throw error; }
  };
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('unhandledrejection', event => banner('Cloud operation failed: ' + (event.reason?.message || 'Unknown error. Changes may not be saved.')));
  window.addEventListener('DOMContentLoaded', () => {
    const projectSelect = document.getElementById('proj'); if (projectSelect) projectSelect.addEventListener('change', event => { if (dirty) { event.stopImmediatePropagation(); projectSelect.value = activeProject || ''; banner('Wait for your current edits to finish saving before changing projects. Unsaved changes are still in this editor.'); } }, true); if (projectSelect) new MutationObserver(() => { for (const option of projectSelect.options) if (titles.has(option.value)) option.textContent = titles.get(option.value); }).observe(projectSelect, {childList:true});
    banner('Cloud editing: import SRT/VTT/timed JSON. Private revision autosaves are active. Browser-available fonts are used unless the approved font bundle is installed; render font parity is unverified. Mac-only tools are disabled.');
    for (const id of ['btnTranscribe', 'spkFind', 'faceFind', 'btnTranslate']) { const el = document.getElementById(id); if (el) { el.disabled = true; el.title = 'Requires the Mac Cutline service; no cloud substitute is configured.'; } }
    const hint = document.querySelector('.ptop .hint'); if (hint) { hint.textContent = 'Cloud · imported captions · browser-font fallback if bundle absent'; hint.title = 'Render font parity remains unverified. Automatic transcription and detection need the Mac.'; }
    const home = document.querySelector('a[href="/cutline-assets/home.html"]'); if (home) { home.href = '/cutline'; home.target = '_top'; }
    const button = document.getElementById('btnRender'); if (button) { button.textContent = 'Render private MP4'; json('status').then(status => { button.disabled = !status.canRender; button.title = status.canRender ? 'Starts one explicitly budgeted cloud render.' : status.message; }).catch(() => { button.disabled = true; }); }
    const upload = document.getElementById('newvid'); if (upload) { upload.accept = 'video/mp4'; upload.title = 'Editor uploads are limited to 4 MiB. Use Private cloud projects for the larger direct-upload lane.'; }
  });
}
/** @param {Array<{family:string,file:string}>} fonts */
export async function cutlineCloudEditorHTML(fonts = []) {
  let html = await readFile(new URL('../../../public/cutline-assets/editor.html', import.meta.url), 'utf8');
  // Browser media loads do not go through fetch; change only this known source assignment.
  const original = 'vid.src = "/api/cutline/runtime/" + doc.video.src';
  if (!html.includes(original)) throw Error('Vendor editor media contract changed; bridge review required.');
  html = html.replace('Rendering with HyperFrames on this Mac. This takes a few minutes...', 'Rendering with the configured private cloud worker. No automatic retry...').replace('Uploading and transcribing...', 'Uploading privately. Import captions afterward...');
  html = html.replace('function save() { clearTimeout(saveT);', 'function save() { window.__cutlineCloudMarkDirty?.(); clearTimeout(saveT);');
  html = html.replace(original, 'vid.src = "/api/cutline-cloud/projects/" + encodeURIComponent(doc.id) + "/source"');
  const renderLine = html.split('\n').find(line => line.includes('$("renderStatus").innerHTML = r.ok ?'));
  if (!renderLine) throw Error('Vendor render result contract changed.');
  html = html.replace(renderLine, `  const statusEl = $("renderStatus"); statusEl.textContent = r.ok ? "Render ready. " : "Render failed. " + (r.error || ""); if (r.ok && r.downloadPath) { const link = document.createElement("a"); link.href = r.downloadPath; link.textContent = "Download private MP4"; link.target = "_blank"; statusEl.appendChild(link); }`);

  // Inject before the vendor shim captures its native fetch; both normalized and
  // original /api/project paths therefore flow into the same cloud bridge.
  html = html.replace('<script>\n// Adapt original local API', () => `<script>(${cutlineCloudEditorBridge.toString()})();</script>\n<script>\n// Adapt original local API`);
  if (!html.includes('cloud-save-status')) throw Error('Vendor editor bridge injection failed.');
  const fontCSS = fonts.filter(f => /^[a-zA-Z0-9 _-]{1,80}$/.test(f.family) && /^[a-zA-Z0-9_-]+\.woff2$/.test(f.file)).map(f => `@font-face{font-family:"${f.family}";src:url("/api/cutline-cloud/assets/${f.file}") format("woff2");}`).join('');
  html = html.replace('</head>', `<style>${fontCSS}</style></head>`);
  html = html.replace('</body>', '<script>window.__cutlineCloudDoc = () => doc;</script></body>');
  return html;
}
