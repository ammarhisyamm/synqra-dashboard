import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Trash as Trash2, Users } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { Wave } from '../Wave.jsx';
import { StatusPill, MetricCard, PageHeading, Empty, Modal } from '../common/ui';
import { TextField } from '../common/Field';
import { Button } from '../ui/button';

export function AdminPageEnhanced({ user, setToast, requestConfirm }) {
  const [admins,setAdmins]=useState([]);
  const [error,setError]=useState(''); const [loaded,setLoaded]=useState(false);
  const [inviteOpen,setInviteOpen]=useState(false);
  const [invite,setInvite]=useState({ name:'',email:'',password:'' });
  const [pending,setPending]=useState(false); const busy=useRef(false);
  const [inviteError,setInviteError]=useState(''); const [reset,setReset]=useState(null);
  const canManage=user.role==='super_admin';
  const load=async()=>{try{const result=await api('/api/admin/users');setAdmins(result.users);setError('');}catch(failure){setError(failure.message);}finally{setLoaded(true);}};
  useEffect(()=>{let active=true;api('/api/admin/users').then(result=>{if(active)setAdmins(result.users);}).catch(failure=>{if(active)setError(failure.message);}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[]);
  const submit=async event=>{
    event.preventDefault();if(busy.current || !canManage)return;busy.current=true;setPending(true);setInviteError('');
    try{await api('/api/admin/users',{method:'POST',body:JSON.stringify(invite)});setInviteOpen(false);setInvite({name:'',email:'',password:''});await load();setToast('Admin account created');}
    catch(failure){setInviteError(failure.message);}finally{busy.current=false;setPending(false);}
  };
  const role=(person,nextRole)=>requestConfirm?.({ icon:<ShieldCheck size={24}/>,title:`${nextRole==='admin'?'Promote':'Demote'} ${person.email}?`,subtitle:'This changes workspace-wide management access.',confirmLabel:nextRole==='admin'?'Promote':'Demote',onConfirm:async()=>{await api(`/api/admin/users/${person.id}`,{method:'PATCH',body:JSON.stringify({role:nextRole})});await load();setToast('Admin role updated');} });
  const remove=person=>requestConfirm?.({danger:true,icon:<Trash2 size={24}/>,title:`Delete ${person.email}?`,subtitle:'Their account will be permanently removed. This cannot be undone.',confirmLabel:'Delete admin',onConfirm:async()=>{await api(`/api/admin/users/${person.id}`,{method:'DELETE'});await load();setToast('Admin removed');} });
  const resetPassword=person=>requestConfirm?.({title:`Reset password for ${person.name}?`,subtitle:'Verify their identity through your office process first. This creates a private, single-use link valid for 15 minutes. MFA remains required.',confirmLabel:'Create reset link',onConfirm:async()=>{const result=await api('/api/admin/password-reset',{method:'POST',body:JSON.stringify({userId:person.id})});setReset({...result,name:person.name});} });
  return <section className="page admin-page">
    <PageHeading title="Admin Management" action={canManage && <Button onClick={()=>setInviteOpen(true)}><Users size={16}/>Invite Admin</Button>}/>
    <div className="admin-kpis"><MetricCard label="Total accounts" value={admins.length}/><MetricCard label="Super Admins" value={admins.filter(person=>person.role==='super_admin').length}/><MetricCard label="Regular Admins" value={admins.filter(person=>person.role==='admin').length}/></div>
    {!canManage && <p>Account creation, role changes and recovery are restricted to super admins.</p>}
    {!loaded?<div className="empty-state"><Wave/>Loading accounts…</div>:error?<><Empty text={error}/><Button onClick={load}>Try again</Button></>:<div className="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Actions</th></tr></thead><tbody>{admins.map(person=><tr key={person.id}><td><strong>{person.email}{person.id===user.id && <small className="you">(You)</small>}</strong></td><td>{person.name}</td><td><StatusPill value={person.role==='super_admin'?'Super admin':person.role==='admin'?'Admin':'Member'}/></td><td>{canManage && person.id!==user.id && person.role!=='super_admin' && <div className="admin-actions"><Button variant="secondary" onClick={()=>role(person,person.role==='admin'?'member':'admin')}>{person.role==='admin'?'Demote':'Promote'}</Button><Button variant="secondary" onClick={()=>resetPassword(person)}>Reset password</Button><Button variant="destructive" onClick={()=>remove(person)}>Delete</Button></div>}</td></tr>)}</tbody></table></div>}
    {inviteOpen && <Modal pending={pending} title="Invite admin" subtitle="Create an account with workspace management access." onClose={()=>setInviteOpen(false)}><form onSubmit={submit}><TextField label="Name" value={invite.name} onChange={event=>setInvite({...invite,name:event.target.value})} required maxLength={80}/><TextField label="Email" type="email" value={invite.email} onChange={event=>setInvite({...invite,email:event.target.value})} required maxLength={254}/><TextField label="Temporary password" type="password" minLength={12} maxLength={128} hint="12–128 characters. Share through a secure channel." value={invite.password} onChange={event=>setInvite({...invite,password:event.target.value})} required/>{inviteError && <p className="form-error" role="alert">{inviteError}</p>}<div className="modal-actions"><Button variant="ghost" disabled={pending} type="button" onClick={()=>setInviteOpen(false)}>Cancel</Button><Button disabled={pending}>{pending?'Creating…':'Create admin'}</Button></div></form></Modal>}
    {reset && <Modal title={`Recovery link · ${reset.name}`} subtitle="Share only after verifying the account owner. Do not paste this link into task comments or feedback." onClose={()=>setReset(null)}><TextField label="Single-use recovery link" readOnly value={reset.resetUrl}/><p>Expires in {reset.expiresInMinutes} minutes. Existing sessions are revoked when the password is changed.</p><div className="modal-actions"><Button variant="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(reset.resetUrl);setToast('Recovery link copied');}catch{setToast('Select the link and copy it manually.');}}}>Copy link</Button><Button onClick={()=>setReset(null)}>Done</Button></div></Modal>}
  </section>;
}
