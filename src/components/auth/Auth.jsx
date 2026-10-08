import { useEffect, useState } from 'react';
import {
  Archive, ArrowRight, Bell, CalendarBlank as CalendarDays, CalendarPlus, Check,
  CheckCircle as CheckCircle2, CaretDown as ChevronDown, CaretUpDown as ChevronsUpDown,
  ClipboardText as ClipboardList, Crown, EnvelopeSimple, Folder, House as Home,
  Info, Kanban as KanbanSquare, ChartBar, List as Menu, ChatCircle as MessageCircle,
  DotsThreeVertical as MoreVertical, Plus, MagnifyingGlass as Search, Gear as Settings,
  ShieldCheck, Sparkle as Sparkles, Trash as Trash2, UserPlus, Users, X
} from '@phosphor-icons/react';
import { Wave } from '../Wave.jsx';
import { AppSelect } from '../common/AppSelect';
import { TextField } from '../common/Field';
import { api } from '../../api/client';
import { relativeDate } from '../../lib/dates';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import './auth-components.css';

export function AuthLoading() { return <div className="auth-shell"><div className="auth-card auth-loading"><Wave style={{ fontSize: 24 }} /><strong>Checking your session…</strong></div></div>; }
export function AuthScreen({ onAuthenticated }) {
  const resetToken=new URLSearchParams(window.location.hash.slice(1)).get('reset') || '';
  const [mode,setMode]=useState(resetToken?'reset':'login');
  const [form,setForm]=useState({ name:'',email:'',identifier:'',password:'',code:'' });
  const [error,setError]=useState('');const [message,setMessage]=useState('');const [pending,setPending]=useState(false);
  const update=(key,value)=>setForm(previous=>({ ...previous,[key]:value }));
  async function submit(event){
    event.preventDefault();if(pending)return;setPending(true);setError('');
    try{
      const payload=mode==='login'?{ identifier:form.identifier,password:form.password,code:form.code }:mode==='reset'?{ token:resetToken,password:form.password,code:form.code }:{ name:form.name,email:form.email,password:form.password };
      const result=await api('/api/auth/'+(mode==='reset'?'password-reset':mode==='login'?'login':'register'),{ method:'POST',body:JSON.stringify(payload) });
      if(mode==='reset'){window.history.replaceState(null,'',window.location.pathname+window.location.search);setMode('login');setForm(previous=>({ ...previous,password:'',code:'' }));setMessage('Password reset. Sign in with your new password.');}
      else onAuthenticated(result.user);
    }catch(failure){setError(failure.message);}finally{setPending(false);}
  }
  return <div className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><img className="synqra-logo auth-logo" src="/logo-synqra.png" alt="Synqra — Powered by MULIA"/></div>
    <h1>{mode==='login'?'Welcome back':mode==='reset'?'Reset your password':'Create your workspace'}</h1>
    <p>{mode==='login'?'Sign in to continue to your project reviews.':mode==='reset'?'This one-use reset link expires after 15 minutes. MFA remains enabled.':'Create your account, then set up your first project.'}</p>
    <form onSubmit={submit}>
      {mode==='register' && <TextField label="Name" value={form.name} onChange={event=>update('name',event.target.value)} autoComplete="name" required/>}
      {mode==='login' && <TextField label="Username or email" value={form.identifier} onChange={event=>update('identifier',event.target.value)} autoComplete="username" required/>}
      {mode==='register' && <TextField label="Email" type="email" value={form.email} onChange={event=>update('email',event.target.value)} autoComplete="email" required/>}
      <TextField label="Password" type="password" hint={mode==='login'?'Your existing account password.':'Use 12–128 characters.'} value={form.password} onChange={event=>update('password',event.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?8:12} maxLength={128} required/>
      {mode!=='register' && <TextField label="Authenticator or recovery code (if enabled)" value={form.code} onChange={event=>update('code',event.target.value)} autoComplete="one-time-code" maxLength={16}/>}
      {error && <div role="alert" className="auth-error">{error}</div>}{message && <p role="status">{message}</p>}
      <button className="primary-button" disabled={pending}>{pending?'Please wait…':mode==='login'?'Sign in':mode==='reset'?'Reset password':'Create account'} <ArrowRight size={16}/></button>
    </form>
    {mode!=='reset' && <button disabled={pending} className="auth-toggle" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');setMessage('');}}>{mode==='login'?'New to Synqra? Create an account':'Already have an account? Sign in'}</button>}
    {mode==='login' && <p>Forgot your password? Contact your workspace administrator for a verified reset link. Email recovery is not connected yet.</p>}
  </section></div>;
}

export function CollaboratorModal({ user, projectId, onClose, onToast, onMembersChanged }) {
  const [members, setMembers] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const load = async () => {
    const data = await api('/api/project-members?project_id=' + encodeURIComponent(projectId));
    setMembers(data.members || []);
  };
  useEffect(() => { load().catch(failure => setError(failure.message)); }, [projectId]);
  const run = async action => {
    if (pending) return;
    setPending(true); setError('');
    try { await action(); await load(); onMembersChanged?.(); }
    catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  };
  const invite = event => {
    event.preventDefault();
    run(async () => {
      const result = await api('/api/project-members', { method: 'POST', body: JSON.stringify({ projectId, email: email.trim(), role }) });
      setEmail(''); setInviteUrl(result.inviteUrl || '');
      onToast(result.emailSent ? 'Invitation email sent' : 'Invitation created. Copy the link below to share it.');
    });
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="collab-modal" onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => { if (pending) event.preventDefault(); }}>
    <DialogTitle>Collaborator</DialogTitle>
    <DialogDescription>Invite people to this project. Editors can change tasks; viewers can only read.</DialogDescription>
    <form className="collab-invite-row" onSubmit={invite}>
      <TextField label="Email" type="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={pending}/>
      <AppSelect value={role} options={['viewer','editor']} onChange={setRole} ariaLabel="Invite role" disabled={pending}/>
      <button className="primary-button" disabled={pending || !email.trim()}><UserPlus size={16}/>{pending ? 'Please wait…' : 'Invite'}</button>
    </form>
    {error && <div role="alert" className="form-error">{error}<button className="text-button" disabled={pending} onClick={() => run(async () => {})}>Retry loading members</button></div>}
    {inviteUrl && <div className="invite-link"><TextField label="Invitation link (expires in 7 days)" value={inviteUrl} readOnly/><button className="secondary-button" onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => onToast('Invitation link copied')).catch(() => setError('Copy failed. Select the link and copy it manually.'))}>Copy link</button></div>}
    <div className="collab-owner"><span className="collab-crown"><Crown size={16}/></span><div><strong>{user.name}</strong><small>{user.email}</small></div><span className="owner-pill">You</span></div>
    {members === null ? <p>Loading members…</p> : members.length ? <div className="collab-list">{members.map(member => <div className="collab-row" key={member.id}>
      <div className="avatar">{member.email.slice(0, 2).toUpperCase()}</div><div><strong>{member.email}</strong><small>{member.status === 'accepted' ? 'Joined' : 'Invited'} {relativeDate(member.createdAt)}</small></div>
      <AppSelect disabled={pending} value={member.role} options={['viewer','editor']} onChange={nextRole => run(() => api('/api/project-members/' + member.id, { method:'PATCH', body:JSON.stringify({ projectId, role:nextRole }) }))} ariaLabel={'Role for ' + member.email}/>
      <button type="button" disabled={pending} className="row-action" onClick={() => run(() => api('/api/project-members/' + member.id + '?project_id=' + encodeURIComponent(projectId), { method:'DELETE' }))} aria-label={'Remove ' + member.email}><Trash2 size={15}/></button>
    </div>)}</div> : <p className="collab-empty">No invitations yet.</p>}
  </DialogContent></Dialog>;
}
