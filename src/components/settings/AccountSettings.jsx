import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { TextField, TextAreaField } from '../common/Field';
import { SelectField } from '../common/ui';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Card } from '../ui/card';

export function SettingsSection({ title, description, children }) {
  return <Card className="office-section"><header><h2>{title}</h2>{description && <p>{description}</p>}</header>{children}</Card>;
}
export function AccountSettings({ user }) {
  const [security,setSecurity] = useState(null);
  const [preferences,setPreferences] = useState(null);
  const [password,setPassword] = useState('');
  const [newPassword,setNewPassword] = useState('');
  const [code,setCode] = useState('');
  const [setup,setSetup] = useState(null);
  const [recovery,setRecovery] = useState([]);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [pending,setPending] = useState(false);
  const busy=useRef(false);
  const [reload,setReload] = useState(0);
  useEffect(() => {
    let active=true;
    Promise.all([api('/api/account/security'),api('/api/account/preferences')]).then(([data,prefs]) => {
      if (active) { setSecurity(data); setPreferences(prefs.preferences); }
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active=false; };
  },[reload]);
  const run = async (action,success) => {
    if (busy.current) return;
    busy.current=true;
    setPending(true); setError('');setMessage('');
    try { await action();setMessage(success); }
    catch (failure) { setError(failure.message); }
    finally { busy.current=false;setPending(false); }
  };
  const secureAction = (path,extra={}) => api('/api/account/'+path,{ method:'POST',body:JSON.stringify({ password,code,...extra }) });
  return <div className="office-grid">
    <SettingsSection title="Account security" description="Protect your account and close sessions on other devices.">
      {security ? <p>{security.activeSessions || 1} active session(s) · MFA {security.mfaEnabled ? 'enabled' : 'not enabled'}</p> : <p>Loading account settings…</p>}
      <Button variant="secondary" disabled={pending || !security} onClick={() => run(async () => { await secureAction('sessions/revoke');setReload(value=>value+1); },'Other devices have been signed out.')}>Sign out other devices</Button>
      <form className="office-form" onSubmit={event => { event.preventDefault(); run(async () => { await secureAction('password',{ newPassword });setPassword('');setNewPassword('');setCode('');setReload(value=>value+1); },'Password changed. Other sessions have been revoked.'); }}>
        <TextField label="Current password" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required maxLength={128}/>
        <TextField label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} required minLength={12} maxLength={128} hint="12–128 characters. Use a unique password."/>
        {(security?.mfaEnabled || setup) && <TextField label="Authenticator or recovery code" autoComplete="one-time-code" value={code} onChange={event=>setCode(event.target.value)} maxLength={16}/>}
        <Button disabled={pending || !security}>Change password</Button>
      </form>
      <div className="office-actions">
        {!security?.mfaEnabled && <Button variant="secondary" disabled={pending || !password || !security?.mfaAvailable} onClick={() => run(async () => { setSetup(await secureAction('mfa/setup'));setRecovery([]); },'Add this key to your authenticator, then enter its six-digit code.')}>Set up MFA</Button>}
        {security?.mfaEnabled && <Button variant="destructive" disabled={pending || !password || !code} onClick={() => run(async () => { await secureAction('mfa/disable');setCode('');setPassword('');setReload(value=>value+1); },'MFA disabled. Other sessions have been revoked.')}>Disable MFA</Button>}
      </div>
      {security && !security.mfaAvailable && <p>MFA requires an encryption key configured by your administrator. Email recovery and office SSO are not connected yet.</p>}
      {setup && <div className="office-callout"><TextField label="Authenticator setup key" readOnly value={setup.secret} hint="Add an account manually in your authenticator using this key. Never share it."/><Button disabled={pending || !code} onClick={() => run(async () => { const result=await secureAction('mfa/enable');setRecovery(result.recoveryCodes);setSetup(null);setPassword('');setCode('');setReload(value=>value+1); },'MFA enabled. Save your recovery codes securely before leaving this page.')}>Verify and enable MFA</Button></div>}
      {recovery.length>0 && <div className="office-callout"><p>One-use recovery codes. These are shown only now.</p><pre className="office-recovery">{recovery.join('\n')}</pre><Button variant="secondary" onClick={() => run(() => navigator.clipboard.writeText(recovery.join('\n')),'Recovery codes copied. Store them safely.')}>Copy recovery codes</Button></div>}
    </SettingsSection>
    <SettingsSection title="Notifications" description="Preferences apply to future notifications. Existing activity stays in your inbox.">
      {preferences ? <form className="office-form" onSubmit={event => { event.preventDefault();run(()=>api('/api/account/preferences',{ method:'PATCH',body:JSON.stringify(Object.fromEntries(Object.entries(preferences).map(([key,value])=>[key,!!value]))) }),'Notification preferences saved.'); }}>
        {[['activity','Project activity and task changes'],['mentions','Mentions in task comments'],['reminders','Due soon and overdue tasks']].map(([key,label])=><label className="office-check" key={key}><Checkbox checked={!!preferences[key]} onCheckedChange={value=>setPreferences(previous=>({ ...previous,[key]:value===true }))}/><span>{label}</span></label>)}
        <Button disabled={pending}>Save preferences</Button>
      </form> : <p>Loading preferences…</p>}
      <p>Use @username in comments to mention a project member. Due-date reminders use UTC calendar days and are delivered once per due date and reminder type.</p>
    </SettingsSection>
    {error && <div className="office-callout office-error" role="alert">{error}<Button variant="secondary" disabled={pending} onClick={()=>setReload(value=>value+1)}>Reload settings</Button></div>}
    {message && <p className="office-callout" role="status">{message}</p>}
    <HelpAndFeedback/>
    {['admin','super_admin'].includes(user.role) && <OperationsPanel/>}
  </div>;
}
function HelpAndFeedback() {
  const [category,setCategory]=useState('bug');const [body,setBody]=useState('');
  const [pending,setPending]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const busy=useRef(false);
  async function submit(event) {
    event.preventDefault(); if(busy.current)return;busy.current=true;setPending(true);setError('');setMessage('');
    try { await api('/api/feedback',{ method:'POST',body:JSON.stringify({ category,body }) });setBody('');setMessage('Feedback saved for your workspace administrators.'); }
    catch(failure){setError(failure.message);}finally{busy.current=false;setPending(false);}
  }
  return <SettingsSection title="Getting started & feedback" description="One workflow for your team, from meeting notes to completed work.">
    <ol className="office-help"><li>Create a private project and invite teammates as editors or viewers.</li><li>Add meeting notes, generate a draft, then review owners, priorities, dates, and estimates before creating tasks.</li><li>Use My Work for assignments and Board for project phases. Status and phase are separate: status describes the work, phase describes its place in your workflow.</li><li>Set an estimate in task details. Reports use estimates, not actual time logged.</li><li>Archive work to keep history. Delete only when you intend permanent removal.</li></ol>
    <p>Keyboard: Tab moves between controls, Enter activates them, Escape closes dialogs, and ⌘/Ctrl K opens search. Do not put passwords, API keys, or confidential client content in feedback.</p>
    <form className="office-form" onSubmit={submit}><SelectField label="Feedback category" value={category} options={[{ value:'bug',label:'Report a bug' },{ value:'idea',label:'Suggest an improvement' },{ value:'help',label:'Ask for help' }]} onChange={setCategory}/><TextAreaField label="Feedback" value={body} onChange={event=>setBody(event.target.value)} maxLength={2000} required placeholder="What happened, what you expected, and how to reproduce it…"/><Button disabled={pending || !body.trim()}>{pending?'Sending…':'Send feedback'}</Button></form>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </SettingsSection>;
}
function OperationsPanel() {
  const [data,setData]=useState(null);const [error,setError]=useState('');const [reload,setReload]=useState(0);
  useEffect(()=>{let active=true;api('/api/admin/operations').then(result=>{if(active){setData(result);setError('');}}).catch(failure=>{if(active)setError(failure.message);});return()=>{active=false;};},[reload]);
  return <SettingsSection title="Workspace operations" description="Only administrators can see operational health and submitted feedback.">
    <Button variant="secondary" onClick={()=>setReload(value=>value+1)}>Refresh operations</Button>
    {error && <p role="alert">{error}</p>}
    {data && <><p>API release: <code>{data.release}</code> · {data.environment}</p><p>{data.cleanup?.pending || 0} pending file cleanups · {data.adoption?.activeUsers || 0} active users · {data.adoption?.taskActions || 0} task actions in seven days.</p><p>Email {data.emailConfigured?'configured':'not configured'} · MFA {data.mfaConfigured?'available':'not configured'}</p><h3>Errors in seven days</h3>{data.errors?.length ? <ul className="office-help">{data.errors.map(item=><li key={item.category+item.code}>{item.category}: {item.code} — {item.count}</li>)}</ul> : <p>No recorded errors. This is not a guarantee that no bugs exist.</p>}<h3>Latest feedback</h3>{data.feedback?.length ? <ul className="office-help">{data.feedback.map(item=><li key={item.id}><strong>{item.category}</strong><p>{item.body}</p><small>{item.createdAt}</small></li>)}</ul> : <p>No feedback yet.</p>}</>}
  </SettingsSection>;
}
