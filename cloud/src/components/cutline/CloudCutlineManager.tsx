"use client";
import { useCallback, useEffect, useState } from 'react';
type Project = { id: string; title: string; revision: number; updatedAt: number; video: { w: number; h: number; duration: number } };
export type CloudCutlineCapability = { canEdit?: boolean; canUpload?: boolean; canRender: boolean; message: string; uploadMaxBytes?: number; directUploadAvailable?: boolean };
export default function CloudCutlineManager({ capability }: { capability: CloudCutlineCapability }) {
  const [projects, setProjects] = useState<Project[]>([]); const [selected, setSelected] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const response = await fetch('/api/cutline-cloud/projects', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'Private project storage is unavailable.'); setProjects(data.projects); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not load saved projects.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!capability.canEdit) return; const timer = setTimeout(() => void refresh(), 0); return () => clearTimeout(timer); }, [capability.canEdit, refresh]);
  async function upload(file: File) {
    if (file.type !== 'video/mp4' || file.size > (capability.uploadMaxBytes || 4194304)) { setError(`Choose an MP4 up to ${capability.directUploadAvailable ? '128' : '4'} MiB, two minutes, and 1920 pixels per side.`); return; }
    setBusy(true); setError('');
    try {
      let response: Response;
      if (capability.directUploadAvailable) {
        const allocation = await fetch('/api/cutline-cloud/uploads/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, size: file.size, contentType: 'video/mp4' }) });
        const prepared = await allocation.json(); if (!allocation.ok) throw Error(prepared.error || 'Could not allocate a private upload.');
        if(prepared.signedUploadUrl){const url=new URL(prepared.signedUploadUrl);if(url.protocol!=='https:'||! /^[a-z0-9]+\.supabase\.co$/.test(url.hostname)||url.username||url.password||url.port)throw Error('Invalid private upload destination');const uploadResponse=await fetch(url,{method:'PUT',headers:{'Content-Type':'video/mp4'},body:file,redirect:'error'});if(!uploadResponse.ok)throw Error('Private MP4 upload failed.');}else{const { upload: directUpload } = await import('@vercel/blob/client');
        await directUpload(prepared.pathname, file, { access: 'private', contentType: 'video/mp4', handleUploadUrl: '/api/cutline-cloud/uploads/token', clientPayload: prepared.uploadId, multipart: true });}
        response = await fetch('/api/cutline-cloud/uploads/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId: prepared.uploadId }) });
      } else {
        response = await fetch('/api/cutline-cloud/projects?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: file });
      }
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Upload failed.'); await refresh(); setSelected(data.id);
    } catch (error) { setError(error instanceof Error ? error.message : 'Upload failed. No project was saved.'); }
    finally { setBusy(false); }
  }
  if (!capability.canEdit) return <div className="cutline-offline"><h2>Cloud editing needs private storage</h2><p>Your original caption editor and shared engine are included. Restore private storage capacity and enable cloud storage before uploading or saving. Nothing is stored temporarily or presented as saved.</p><p>Apple face detection, local translation, speaker detection, transcription and the watch folder still need the Mac. Cloud edits can use imported SRT, VTT or timed JSON captions.</p></div>;
  return <section aria-label="Private cloud caption projects" style={{ border: '1px solid #454545', padding: 20, background: '#111', color: '#fff', borderRadius: 12 }}>
    <h2>Private cloud projects</h2><p>Upload a short MP4, then import SRT, VTT or timed JSON in the full editor. Word, caption, keyframe and transition controls use the original engine. Every successful autosave creates a private revision.</p>
    <p>MP4 only · up to {capability.directUploadAvailable ? '128' : '4'} MiB · two minutes · 1920 pixels per side. Automatic transcription, face detection, speaker detection, translation and watch folders are Mac-only. {capability.canRender ? 'MP4 rendering uses a separate approved spending gate.' : 'MP4 cloud rendering is currently inactive; SRT export and cloud edits do not start a render.'}</p>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ padding: '10px 16px', border: '1px solid #ed292f', cursor: busy || !capability.canUpload ? 'not-allowed' : 'pointer' }}> {busy ? 'Uploading privately…' : 'Upload an MP4'}<input aria-label="Upload private MP4" type="file" accept="video/mp4" disabled={busy || !capability.canUpload} style={{ display: 'block', maxWidth: 280 }} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /></label>
      <button type="button" disabled={loading} onClick={() => void refresh()}>Refresh projects</button>
      {!capability.canUpload && <span>Uploads are disabled by the owner.</span>}
    </div>
    {error && <p role="alert" style={{ color: '#ff777b' }}>{error}</p>}
    {loading && <p role="status">Loading private projects…</p>}
    {!loading && !projects.length && !error && <p>No cloud projects yet. Existing Mac projects stay on the Mac.</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>{projects.map(project => <button key={project.id} type="button" aria-pressed={selected === project.id} onClick={() => setSelected(project.id)} style={{ border: selected === project.id ? '2px solid #ed292f' : '1px solid #555', padding: 12, background: '#1a1a1a', color: '#fff', textAlign: 'left' }}><strong>{project.title}</strong><br /><small>{project.video.duration.toFixed(1)}s · {project.video.w}×{project.video.h} · revision {project.revision}</small></button>)}</div>
    {selected && <><p><a href={`/api/cutline-cloud/projects/${selected}/srt`} style={{ color: '#ff646a' }}>Download latest saved SRT</a> · <a href={`/api/cutline-cloud/editor?p=${selected}`} target="_blank" rel="noreferrer" style={{ color: '#fff' }}>Open editor in a new tab</a></p><iframe key={selected} title="Original Cutline editor with private cloud projects" src={`/api/cutline-cloud/editor?p=${selected}`} className="cutline-frame" style={{ width: '100%', minHeight: 880, border: '1px solid #555' }} /></>}
  </section>;
}
