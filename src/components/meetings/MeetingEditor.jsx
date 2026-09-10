import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarBlank, Check, FileText, Lightbulb, MagicWand, Target, User, Users, X } from '@phosphor-icons/react';
import { MeetingAiReview } from './MeetingAiReview';

const today = () => new Date().toISOString().slice(0, 10);
const templates = [
  { title: 'Blank Meeting', subtitle: 'Start from scratch', icon: FileText, notes: '' },
  { title: 'Meeting Notes', subtitle: 'Standard meeting notes', icon: FileText, notes: 'Yesterday:\n\nToday:\n\nBlockers:\n' },
  { title: 'Daily Standup', subtitle: 'Yesterday / Today / Blockers', icon: Target, notes: 'Yesterday:\n\nToday:\n\nBlockers:\n' },
  { title: 'Sprint Planning', subtitle: 'Goal, stories, risks', icon: Target, notes: 'Goal:\n\nStories:\n\nRisks:\n' }
];

function extractItems(notes) {
  return notes.split(/[\n.]+/).map(value => value.replace(/^\s*(?:[-•*]\s*)?/, '').trim()).filter(value => value.length > 4).slice(0, 8).map((value, index) => ({
    id: `ai-${index}-${Date.now()}`,
    keep: true,
    title: value.length > 80 ? `${value.slice(0, 77)}…` : value,
    description: `Action item from the ${index === 0 ? 'meeting discussion' : 'meeting notes'}.`,
    assignee: '',
    due: '',
    priority: index === 2 ? 'Minor' : 'Major',
    area: 'Engineering'
  }));
}

export function MeetingEditor({ user, onClose, onCreate, onToast }) {
  const [phase, setPhase] = useState('writing');
  const [form, setForm] = useState({ title: '', date: today(), notes: '' });
  const [items, setItems] = useState([]);
  const [saved, setSaved] = useState(false);
  const update = (key, value) => { setForm(previous => ({ ...previous, [key]: value })); setSaved(false); };
  const useTemplate = template => {
    update('notes', template.notes);
    if (!form.title) update('title', template.title === 'Blank Meeting' ? '' : template.title);
  };
  const generate = () => {
    if (!form.notes.trim()) { onToast('Write some meeting notes first'); return; }
    setItems(extractItems(form.notes));
    setPhase('ai');
  };
  const preview = useMemo(() => items.filter(item => item.keep).length, [items]);
  if (phase === 'ai') return <MeetingAiReview user={user} meeting={form} items={items} setItems={setItems} selectedCount={preview} onBack={() => setPhase('writing')} onCreate={onCreate} />;
  return <section className="meeting-editor-page">
    <div className="meeting-editor-top"><button className="back-link" onClick={onClose}><ArrowLeft size={17}/> Meetings</button><div className="meeting-editor-actions"><button className="secondary-button" disabled={!form.title.trim()} onClick={() => { setSaved(true); onToast('Meeting draft saved'); }}>Save</button><button className="primary-button" disabled={!form.title.trim() || !form.notes.trim()} onClick={generate}><MagicWand size={16}/> Generate AI</button></div></div>
    <div className="meeting-editor-heading"><input className="meeting-title-input" value={form.title} onChange={event => update('title', event.target.value)} placeholder="Untitled Meeting" autoFocus/><div className="meeting-meta"><label><CalendarBlank size={14}/><input type="date" value={form.date} onChange={event => update('date', event.target.value)}/></label><span className="avatar">{(user?.name || 'A').slice(0, 1).toUpperCase()}</span><span>Draft</span><span className={saved ? 'save-state saved' : 'save-state'}><i/>{saved ? 'Saved' : 'Unsaved'}</span></div></div>
    <div className="meeting-editor-tabs"><span className="active"><i/>Writing</span><span><i/>Review</span><span><i/>Completed</span></div>
    <div className="meeting-editor-canvas"><div className="editor-prompt"><strong>Start writing</strong><p>Type <kbd>/</kbd> for commands, <kbd>@</kbd> to mention, or pick a template</p><textarea value={form.notes} onChange={event => update('notes', event.target.value)} placeholder="Start writing your meeting notes…"/></div><div className="template-grid">{templates.map(template => { const Icon = template.icon; return <button key={template.title} className="template-card" onClick={() => useTemplate(template)}><Icon size={18}/><span><strong>{template.title}</strong><small>{template.subtitle}</small></span></button>; })}</div><div className="recently-used"><span className="editor-label"><Check size={13}/> Recently used</span><button className="recent-template" onClick={() => useTemplate(templates[0])}><FileText size={14}/> Blank Meeting</button></div><div className="editor-hints"><span><FileText size={13}/> <kbd>/</kbd> Commands</span><span><Users size={13}/> <kbd>@</kbd> Mention</span><span><FileText size={13}/> <kbd>[[</kbd> Link</span><span><MagicWand size={13}/> Generate AI</span></div><div className="ai-tips"><span><Lightbulb size={14}/> AI tips</span><p>✨ Type “Decision:” to create a decision block</p><p>✨ Use @mentions to assign tasks automatically</p><p>✨ Type “today” or “Friday” for smart dates</p></div></div>
  </section>;
}
