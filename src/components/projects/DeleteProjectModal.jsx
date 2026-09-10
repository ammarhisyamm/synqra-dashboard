import { useState } from 'react';
import { Check, Trash, Warning, X } from '@phosphor-icons/react';

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
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="delete-project-modal" onMouseDown={event => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
      <div className="delete-project-icon"><Warning size={25}/></div>
      <h2>Delete project?</h2>
      <p>This will permanently delete <strong>“{project.name}”</strong> and all associated data. This cannot be undone.</p>
      <span className="delete-project-label">THE FOLLOWING WILL BE DELETED:</span>
      <div className="delete-project-effects"><span><Check size={14}/> Reviews</span><span><Check size={14}/> Meetings</span><span><Check size={14}/> Comments</span><span><Check size={14}/> Workflow data</span></div>
      <form onSubmit={submit}>
        <label>Type <strong>{project.name}</strong> to confirm<input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={project.name}/></label>
        <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="danger-button" disabled={!matches || pending}><Trash size={15}/>{pending ? 'Deleting…' : 'Delete project'}</button></div>
      </form>
    </section>
  </div>;
}
