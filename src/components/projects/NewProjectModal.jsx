import { useState } from 'react';
import { Plus, X } from '@phosphor-icons/react';
import { TextField } from '../common/Field';

export function NewProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async event => {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    try { await onCreate(name.trim()); } finally { setPending(false); }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-dialog-title" onMouseDown={event => event.stopPropagation()}><button className="modal-close" type="button" onClick={onClose} aria-label="Close new project dialog"><X size={22}/></button><div className="project-modal-icon"><Plus size={28}/></div><h2 id="new-project-dialog-title">New project</h2><p>Create a new project to organize your feedback.</p><form onSubmit={submit}><TextField label="Project name" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Marketplace Redesign" required/><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim() || pending}>{pending ? 'Creating…' : 'Create project'}</button></div></form></section></div>;
}
