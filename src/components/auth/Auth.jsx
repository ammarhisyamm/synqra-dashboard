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
import { api } from '../../api/client';
import { relativeDate } from '../../lib/dates';

export function AuthLoading() { return <div className="auth-shell"><div className="auth-card auth-loading"><Wave style={{ fontSize: 24 }} /><strong>Checking your session…</strong></div></div>; }
export function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); const [form, setForm] = useState({ name:'', email:'', identifier:'', password:'' }); const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const submit = async event => { event.preventDefault(); setPending(true); setError(''); try { const payload = mode === 'login' ? { identifier: form.identifier, password: form.password } : { name: form.name, email: form.email, password: form.password }; const result = await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { method:'POST', body:JSON.stringify(payload) }); onAuthenticated(result.user); } catch (err) { setError(err.message); } finally { setPending(false); } };
  return <div className="auth-shell"><section className="auth-card"><div className="auth-brand"><img className="synqra-logo auth-logo" src="/logo-synqra.png" alt="Synqra — Powered by MULIA"/></div><h1>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1><p>{mode === 'login' ? 'Sign in to continue to your project reviews.' : 'Your first account becomes the workspace super admin.'}</p><form onSubmit={submit}>{mode === 'register' && <label>Name<input value={form.name} onChange={e=>update('name',e.target.value)} autoComplete="name" required/></label>}{mode === 'login' ? <label>Username or email<input value={form.identifier} onChange={e=>update('identifier',e.target.value)} autoComplete="username" required/></label> : <label>Email<input type="email" value={form.email} onChange={e=>update('email',e.target.value)} autoComplete="email" required/></label>}<label>Password<input type="password" value={form.password} onChange={e=>update('password',e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="8" required/><small>At least 8 characters.</small></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button" disabled={pending}>{pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16}/></button></form><button className="auth-toggle" onClick={()=>{setMode(mode === 'login' ? 'register' : 'login');setError('');}}>{mode === 'login' ? 'New to Synqra? Create an account' : 'Already have an account? Sign in'}</button></section></div>;
}

export function CollaboratorModal({ user, onClose, onToast, onMembersChanged }) {
  const changed = () => { if (onMembersChanged) onMembersChanged(); };
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const [members, setMembers] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [pending, setPending] = useState(false);
  const load = () => api('/api/project-members').then(data => setMembers(data.members)).catch(error => onToast(error.message));
  useEffect(() => { load(); }, []);
  const invite = async event => {
    event.preventDefault();
    const value = email.trim();
    if (!value || pending) return;
    setPending(true);
    try {
      const result = await api('/api/project-members', { method: 'POST', body: JSON.stringify({ email: value, role }) });
      setEmail('');
      await load();
      changed();
      onToast(result.emailSent ? `Invitation email sent to ${value}` : `Invite saved for ${value} — email service not configured yet`);
    } catch (error) { onToast(error.message); } finally { setPending(false); }
  };
  const remove = async member => {
    try { await api(`/api/project-members/${member.id}`, { method: 'DELETE' }); await load(); changed(); }
    catch (error) { onToast(error.message); }
  };
  const updateRole = async (member, nextRole) => { try { await api(`/api/project-members/${member.id}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }); await load(); onToast(`${member.email} is now ${nextRole}`); } catch (error) { onToast(error.message); } };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="collab-modal" role="dialog" aria-modal="true" aria-labelledby="collaborator-dialog-title" onMouseDown={e => e.stopPropagation()}><button type="button" className="modal-close" onClick={onClose} aria-label="Close collaborator dialog"><X size={19}/></button><span className="collab-icon"><Plus size={22}/></span><h2 id="collaborator-dialog-title">Collaborator</h2><p className="collab-subtitle">Undang anggota dan atur akses tiap orang: Editor atau Viewer.</p><form className="collab-invite-row" onSubmit={invite}><label className="collab-email"><EnvelopeSimple size={16}/><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Masukkan alamat email" required/></label><AppSelect value={role} options={['viewer','editor']} onChange={setRole} ariaLabel="Invite role"/><button className="primary-button" disabled={pending || !email.trim()}><UserPlus size={16}/> Undang</button></form><p className="collab-note"><strong>Editor</strong> dapat menambah &amp; mengubah review item · <strong>Viewer</strong> hanya bisa melihat.</p><div className="collab-owner"><span className="collab-crown"><Crown size={16}/></span><div><strong>{user.name}</strong><small>{user.email}</small></div><span className="owner-pill">Owner</span></div>{members === null ? <div className="empty-state"><Wave /> Loading members…</div> : members.length ? <div className="collab-list">{members.map(member => <div className="collab-row" key={member.id}><div className="avatar">{member.email.slice(0, 2).toUpperCase()}</div><div><strong>{member.email}</strong><small>Invited {relativeDate(member.createdAt)}</small></div><AppSelect value={member.role} options={['viewer','editor']} onChange={nextRole => updateRole(member, nextRole)} ariaLabel={`Role for ${member.email}`}/><button type="button" className="row-action" onClick={() => remove(member)} aria-label={`Remove ${member.email}`}><Trash2 size={15}/></button></div>)}</div> : <p className="collab-empty">Belum ada anggota yang diundang.</p>}</section></div>;
}
