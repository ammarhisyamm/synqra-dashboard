import { useEffect, useState } from 'react';
import { ArrowRight, Eye, GearSix as Settings2, Link as Link2, Lock, Trash as Trash2, Warning as TriangleAlert, Users } from '@phosphor-icons/react';
import { PageHeading } from '../common/ui';
import { TextField, TextAreaField } from '../common/Field';

export function SettingsPageEnhanced({ project, user, saveProject, setToast, onDeleteProject }) {
  const [form, setForm] = useState({ name: project.name, description: project.description || '', accessMode: project.accessMode || 'link' });
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = form.name !== (project.name || '') || form.description !== (project.description || '') || form.accessMode !== (project.accessMode || 'link');
  useEffect(() => { setJustSaved(false); }, [form.name, form.description, form.accessMode]);
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try { await saveProject(form); setJustSaved(true); }
    finally { setSaving(false); }
  };
  useEffect(() => setForm({ name: project.name, description: project.description || '', accessMode: project.accessMode || 'link' }), [project.name, project.description, project.accessMode]);
  const shareLink = `${window.location.origin}/?project=${project.id || 'default'}`;
  return <section className="page settings-page"><PageHeading title="Settings"/><div className="settings-card"><section><div className="settings-section-head"><span><Settings2 size={20}/></span><div><h2>General</h2><p>Manage your project details.</p></div></div><TextField label="Project name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/><TextAreaField label="Description" rows={4} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Optional project description"/></section><section><div className="settings-section-head"><span><Users size={20}/></span><div><h2>Sharing & access</h2><p>Control who can view this project.</p></div></div><button className={form.accessMode === 'invite' ? 'access-option selected' : 'access-option'} onClick={() => setForm({ ...form, accessMode: 'invite' })}><Lock size={18}/><span><strong>Invite only</strong><small>Only people you invite by email can access this project.</small></span></button><button className={form.accessMode === 'link' ? 'access-option selected' : 'access-option'} onClick={() => setForm({ ...form, accessMode: 'link' })}><Link2 size={18}/><span><strong>Anyone with the link</strong><small>Anyone who has the link can view this project in read-only mode.</small></span></button>{form.accessMode === 'link' && <div className="share-link"><Eye size={15}/><input readOnly value={shareLink}/><button onClick={() => { navigator.clipboard?.writeText(shareLink); setToast('Project link copied'); }}>Copy</button></div>}<button className="primary-button settings-save" disabled={!['super_admin','admin'].includes(user.role) || !dirty || saving} onClick={save}>{saving ? 'Saving…' : justSaved && !dirty ? 'Saved ✓' : 'Save changes'}</button></section><section className="danger-section"><div className="settings-section-head"><span><TriangleAlert size={20}/></span><div><h2 className="danger-title">Danger zone</h2><p>Permanently delete this project and all associated feedback.</p></div></div><button className="danger-button" disabled={project.id === 'default' || !['super_admin','admin'].includes(user.role)} onClick={onDeleteProject}><Trash2 size={15}/> {project.id === 'default' ? 'Default project is protected' : 'Delete project'}</button></section></div></section>;
}


