import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { TextField } from '../common/Field';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

export function NewProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async event => {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    try { await onCreate(name.trim()); } finally { setPending(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="project-modal"><div className="project-modal-icon"><Plus size={28}/></div><DialogHeader><DialogTitle>New project</DialogTitle><DialogDescription>Create a new project to organize your feedback.</DialogDescription></DialogHeader><form onSubmit={submit}><TextField label="Project name" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Marketplace Redesign" required/><DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!name.trim() || pending}>{pending ? 'Creating…' : 'Create project'}</Button></DialogFooter></form></DialogContent></Dialog>;
}
