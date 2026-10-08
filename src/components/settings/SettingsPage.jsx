import { useEffect,useState } from 'react';
import { PageHeading,SelectField } from '../common/ui';
import { TextField,TextAreaField } from '../common/Field';
import { Button } from '../ui/button';
import { AccountSettings,SettingsSection } from './AccountSettings';
import './settings.css';

export function SettingsPageEnhanced({ project,user,saveProject,setToast,onDeleteProject }) {
  const [form,setForm]=useState({ name:project.name,description:project.description || '',accessMode:project.accessMode || 'invite' });
  const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  const canManage=['super_admin','admin'].includes(user.role) || (project.createdBy===user.id && project.role!=='viewer');
  const dirty=form.name!==project.name || form.description!==(project.description || '') || form.accessMode!==(project.accessMode || 'invite');
  useEffect(()=>{setForm({ name:project.name,description:project.description || '',accessMode:project.accessMode || 'invite' });setError('');setMessage('');},[project.id,project.name,project.description,project.accessMode]);
  async function save(event){
    event.preventDefault();if(saving || !canManage)return;
    if(!form.name.trim()){setError('Project name cannot be empty.');return;}
    setSaving(true);setError('');setMessage('');
    try{await saveProject({ ...form,name:form.name.trim() });setMessage('Project settings saved.');}
    catch(failure){setError(failure.message);}finally{setSaving(false);}
  }
  const shareLink=`${window.location.origin}/?project=${encodeURIComponent(project.id)}`;
  return <section className="page settings-page"><PageHeading title="Settings"/>
    <div className="office-grid">
      <SettingsSection title="Project settings" description="Owners and administrators manage project details and sharing.">
        {!canManage && <p>This project's settings are read only for your account.</p>}
        <form className="office-form" onSubmit={save}>
          <TextField label="Project name" disabled={!canManage || saving} value={form.name} onChange={event=>setForm(previous=>({ ...previous,name:event.target.value }))} maxLength={120} required/>
          <TextAreaField label="Description" disabled={!canManage || saving} value={form.description} onChange={event=>setForm(previous=>({ ...previous,description:event.target.value }))} maxLength={2000} placeholder="Optional project description"/>
          <SelectField label="Project access" disabled={!canManage || saving} value={form.accessMode} options={[{ value:'invite',label:'Invite only' },{ value:'link',label:'Signed-in users with the link · View only' }]} onChange={value=>setForm(previous=>({ ...previous,accessMode:value }))}/>
          <p>Invite-only projects are private. Link sharing grants read-only access to signed-in users who open this project link.</p>
          <Button disabled={!canManage || !dirty || saving}>{saving?'Saving…':'Save changes'}</Button>
        </form>
        {form.accessMode==='link' && <div className="office-form"><TextField label="Read-only project link" value={shareLink} readOnly/><Button variant="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(shareLink);setToast('Project link copied');}catch{setToast('Could not copy. Select the link and copy it manually.');}}}>Copy link</Button></div>}
        {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      </SettingsSection>
      <SettingsSection title="Danger zone" description="Deletion permanently removes this project, its tasks, meetings, comments, and files. Archive individual tasks when you need to preserve their history.">
        <Button variant="destructive" disabled={!canManage || project.id==='default'} onClick={onDeleteProject}>{project.id==='default'?'Default project is protected':'Delete project'}</Button>
      </SettingsSection>
    </div>
    <AccountSettings user={user}/>
  </section>;
}
