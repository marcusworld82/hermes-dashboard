'use client';
import { AgentControls } from './AgentControls';
import { useState } from 'react';
import { api, useApi } from '@/lib/client';
import { Button, Card, ErrorNote, Field, inputCls } from '@/components/ui';
import type { AgentEditorState, AgentEditorSnapshot, AgentEditorPreview } from '@/lib/types/agent-editor';
export function AgentEditor({ id, onSaved }: { id: string; onSaved?: () => void }) {
  const { data, error, reload } = useApi<AgentEditorSnapshot>(`/api/agents/${id}/editor`);
  const [draft, setDraft] = useState<AgentEditorState | null>(null), [plan, setPlan] = useState<AgentEditorPreview | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const state = draft ?? data?.state;
  function change(patch: Partial<AgentEditorState>) { if (state) setDraft({ ...state, ...patch }); setPlan(null); }
  async function action(kind: 'preview' | 'save' | 'revert', auditId?: string) {
    if (!data || !state) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api<AgentEditorPreview>(`/api/agents/${id}/editor`, { method: 'POST', json: { action: kind, state, revision: plan?.revision ?? data.revision, previewHash: plan?.previewHash, auditId } });
      if (kind === 'preview') { setPlan(result); setMessage(result.changed ? 'Review the diff, then save these exact changes.' : 'No changes to save.'); }
      else { setPlan(null); setDraft(null); setMessage(kind === 'revert' ? 'Previous profile fields restored.' : 'Profile saved and verified. Backup and audit recorded.'); await reload(); onSaved?.(); }
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <><AgentControls id={id} /><Card className="p-5 mt-5"><h2 className="font-semibold text-lg mb-2">Edit agent</h2><p className="text-sm text-gray-500 mb-4">Changes write to this agent profile. Preview first, then save. Backups contain only the editable fields, never credentials.</p><ErrorNote text={error} />{message && <p role="status" className="text-sm mb-4">{message}</p>}{state && data ? <><Field label="Display name"><input className={inputCls} maxLength={100} value={state.displayName} onChange={e => change({ displayName: e.target.value })} /></Field><Field label="Role description"><textarea className={`${inputCls} min-h-24`} maxLength={4000} value={state.description} onChange={e => change({ description: e.target.value })} /></Field><Field label={`Model (${data.provider})`} hint="Choose an existing model configured for this provider. Provider credentials stay untouched."><select className={inputCls} value={state.model} onChange={e => change({ model: e.target.value })}>{data.availableModels.map(m => <option key={m}>{m}</option>)}</select></Field><Field label="System instructions (SOUL.md)"><textarea className={`${inputCls} min-h-72 font-mono text-xs`} maxLength={100000} value={state.soul} onChange={e => change({ soul: e.target.value })} /></Field><fieldset className="mb-4"><legend className="text-xs text-gray-500 mb-2">Installed skills</legend><div className="grid sm:grid-cols-2 gap-2 max-h-64 overflow-auto">{data.availableSkills.map(s => <label key={s} className="text-sm flex gap-2 items-start"><input type="checkbox" checked={state.enabledSkills.includes(s)} onChange={e => change({ enabledSkills: e.target.checked ? [...state.enabledSkills, s] : state.enabledSkills.filter(v => v !== s) })} />{s}</label>)}{!data.availableSkills.length && <p className="text-sm">No editable installed skills. Use Skills to install or assign one.</p>}</div></fieldset><div className="flex gap-2"><Button variant="light" disabled={busy} onClick={() => action('preview')}>Preview changes</Button><Button disabled={busy || !plan?.changed} onClick={() => action('save')}>Save reviewed changes</Button></div>{plan?.diff && <pre className="whitespace-pre-wrap break-words text-xs border rounded-xl p-3 mt-4 max-h-96 overflow-auto">{plan.diff}</pre>}<h3 className="font-semibold mt-6 mb-3">Audit and backups</h3>{data.history?.length ? data.history.map(v => <div key={v.id} className="flex flex-wrap gap-3 justify-between border-t py-3 text-sm"><span>{new Date(v.at).toLocaleString()} · {v.status}</span><Button size="sm" variant="light" disabled={busy || v.status !== 'saved'} onClick={() => action('revert', v.id)}>Revert this save</Button></div>) : <p className="text-sm text-gray-500">No changes saved through this editor.</p>}</> : !error && <p>Reading profile…</p>}</Card></>;
}
