import { useState } from 'react';
import { Check, Trash, Warning } from '@phosphor-icons/react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';

export function DeleteProjectModal({ project, onClose, onDelete }) {
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const matches = confirmation.trim() === project.name;
  const submit = async event => {
    event.preventDefault();
    if (!matches || pending) return;
    setPending(true);
    try { await onDelete(project.id); } finally { setPending(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="delete-project-modal" role="alertdialog">
      <div className="delete-project-icon"><Warning size={25}/></div>
      <DialogHeader><DialogTitle>Delete project?</DialogTitle><DialogDescription>This will permanently delete <strong>“{project.name}”</strong> and all associated data. This cannot be undone.</DialogDescription></DialogHeader>
      <span className="delete-project-label">THE FOLLOWING WILL BE DELETED:</span>
      <ul className="delete-project-effects">
        <li><Check size={14}/> Reviews</li>
        <li><Check size={14}/> Meetings</li>
        <li><Check size={14}/> Comments</li>
        <li><Check size={14}/> Workflow data</li>
      </ul>
      <form onSubmit={submit}>
        <label>Type <strong>{project.name}</strong> to confirm<Input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={project.name}/></label>
        <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button variant="destructive" disabled={!matches || pending}><Trash size={15}/>{pending ? 'Deleting…' : 'Delete project'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
