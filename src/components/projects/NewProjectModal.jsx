import { useState } from 'react';
import { Plus, X } from '@phosphor-icons/react';

export function NewProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async event => {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    try { await onCreate(name.trim()); } finally { setPending(false); }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="project-modal" onMouseDown={event => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={22}/></button><div className="project-modal-icon"><Plus size={28}/></div><h2>New project</h2><p>Create a new project to organize your feedback.</p><form onSubmit={submit}><label>Project name<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Marketplace Redesign" required/></label><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim() || pending}>{pending ? 'Creating…' : 'Create project'}</button></div></form></section></div>;
}
