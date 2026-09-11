import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarBlank as CalendarDays, CalendarPlus, CheckCircle as CheckCircle2, Plus, Sparkle as Sparkles, Trash, X } from '@phosphor-icons/react';
import { AREAS } from '../../constants/workflow';
import { dateLabel, groupDateLabel, shortDate } from '../../lib/dates';
import { statusFor, extractNotes } from '../../lib/helpers';
import { PageHeading, Empty, DatePicker, Modal } from '../common/ui';

export function Meetings({ meetings, reviews = [], addMeeting, addReview, onDeleteMeeting, setToast, setModal, onNewMeeting, onTasksCreated, onOpen }) {
  const [selected, setSelected] = useState(meetings[0]?.id);
  const [dateFilter, setDateFilter] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => { if (!pickerOpen) return undefined; const onKey = e => { if (e.key === 'Escape') setPickerOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [pickerOpen]);
  const meeting = meetings.find(m => m.id === selected) || meetings[0];
  const [drafts, setDrafts] = useState([]);
  const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => setDrafts(meeting ? extractNotes(meeting.notes) : []), [meeting?.id]);
  useEffect(() => { setNotesOpen(false); }, [meeting?.id]);
  useEffect(() => { if (!notesOpen) return undefined; const onKey = e => { if (e.key === 'Escape') setNotesOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [notesOpen]);
  const visible = meetings.filter(m => !dateFilter || m.date === dateFilter);
  const groups = useMemo(() => {
    const map = new Map();
    [...visible].sort((a, b) => b.date.localeCompare(a.date)).forEach(m => {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date).push(m);
    });
    return [...map.entries()];
  }, [visible]);
  const createDrafts = () => { drafts.forEach((title, i) => addReview({ title, area: AREAS[i % AREAS.length], priority: i === 0 ? 'Major' : 'Minor', stage: 'Planning', status: 'Open', assignee: ['Aria','Leo','Mia'][i % 3], due: '2026-09-18', meetingId: meeting.id })); onTasksCreated(drafts.length); };
  const noteLines = meeting ? meeting.notes.split('\n').map(s => s.trim()).filter(Boolean) : [];
  return <section className="page meetings-page"><PageHeading title="Meetings" action={<button className="primary-button" onClick={onNewMeeting}><CalendarPlus size={16}/> New meeting</button>}/>
    <div className="meetings-layout">
      <div className="meetings-side">
        <div><button className="date-filter" onClick={() => setPickerOpen(true)}><CalendarDays size={15}/> {dateFilter ? groupDateLabel(dateFilter) : 'Filter by date'}</button>{dateFilter && <button className="date-clear-text" onClick={() => setDateFilter('')}>Clear</button>}</div>
        {pickerOpen && <div className="modal-backdrop" onMouseDown={() => setPickerOpen(false)}><div onMouseDown={e => e.stopPropagation()}><DatePicker value={dateFilter} onPick={iso => { setDateFilter(iso); setPickerOpen(false); }} onClear={() => { setDateFilter(''); setPickerOpen(false); }} /></div></div>}
        {groups.length ? groups.map(([date, items]) => <div key={date} className="meeting-group"><p className="meeting-group-label">{groupDateLabel(date)} · {items.length} meeting{items.length === 1 ? '' : 's'}</p>{items.map(m => <article key={m.id} className={`meeting-card${m.id === meeting?.id ? ' selected' : ''}`} onClick={() => setSelected(m.id)}><div><strong>{m.title}</strong><p><CalendarDays size={12}/> {dateLabel(m.date)}{m.ai && <span className="ai-badge"><Sparkles size={11}/> AI</span>}</p></div><div className="meeting-card-actions"><button onClick={e => { e.stopPropagation(); onDeleteMeeting(m.id); }} aria-label={`Delete ${m.title}`}><Trash size={15}/></button></div></article>)}</div>) : <Empty text="No meetings found."/>}
      </div>
      {meeting && <aside className="meeting-detail-card">
        <div className="meeting-detail-body"><h2>{meeting.title}</h2><p className="meeting-detail-date"><CalendarDays size={13}/> {groupDateLabel(meeting.date)}</p><div className="notes-head"><p className="detail-label">ISI RAPAT</p>{noteLines.length > 5 && <button type="button" className="text-button notes-toggle" onClick={() => setNotesOpen(true)}>View details</button>}</div>{noteLines.length ? <ul className="notes-lines notes-clamp">{noteLines.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p className="notes-empty">No notes yet.</p>}</div>
        {notesOpen && <div className="modal-backdrop" onMouseDown={() => setNotesOpen(false)}><section className="modal notes-modal" role="dialog" aria-modal="true" aria-label={`Meeting notes — ${meeting.title}`} onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setNotesOpen(false)} aria-label="Close meeting notes"><X size={19}/></button><p className="detail-label">ISI RAPAT</p><h2>{meeting.title}</h2><p className="meeting-detail-date"><CalendarDays size={13}/> {groupDateLabel(meeting.date)}</p><ul className="notes-lines notes-full">{noteLines.map((line, i) => <li key={i}>{line}</li>)}</ul></section></div>}
        <div className="meeting-actions"><div className="meeting-actions-head"><h3>Action items</h3><span>{reviews.filter(item => item.meetingId === meeting.id).length + drafts.length} item{reviews.filter(item => item.meetingId === meeting.id).length + drafts.length === 1 ? '' : 's'}</span><button className="add-task-btn" disabled={!drafts.length} onClick={createDrafts}><Plus size={14}/> Add task</button></div>{drafts.length ? <div className="draft-list">{drafts.map((d, i) => <div key={`${d}-${i}`}><CheckCircle2 size={18}/><input value={d} onChange={e=>setDrafts(a=>a.map((x,n)=>n===i?e.target.value:x))}/><button onClick={()=>setDrafts(a=>a.filter((_,n)=>n!==i))}><X size={16}/></button></div>)}</div> : <div className="draft-empty"><span className="draft-empty-icon"><Sparkles size={17}/></span><strong>No action items yet</strong><p>Write clear action lines in the notes above to generate drafts.</p></div>}{reviews.filter(item => item.meetingId === meeting.id).map(item => <button className="linked-action-item" key={item.id} onClick={() => onOpen && onOpen(item)}><strong>{item.title}</strong><span>{item.priority} · {statusFor(item)}{item.due ? ` · ${shortDate(item.due)}` : ''}</span></button>)}</div>
      </aside>}
    </div></section>;
}


export function MeetingModal({ onClose, onSave }) { const [form,setForm]=useState({title:'',date:new Date().toISOString().slice(0, 10),notes:'',ai:true}); const edit=(k,v)=>setForm(x=>({...x,[k]:v})); return <Modal title="New meeting" subtitle="Notes are saved to this project and can generate review items." onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(form.title.trim())onSave(form)}}><label>Meeting title<input autoFocus value={form.title} onChange={e=>edit('title',e.target.value)} placeholder="e.g. Design review" required/></label><label>Date<input type="date" value={form.date} onChange={e=>edit('date',e.target.value)}/></label><label>Notes<textarea value={form.notes} onChange={e=>edit('notes',e.target.value)} placeholder="One decision or action per line" rows="6"/></label><label className="switch-label"><input type="checkbox" checked={form.ai} onChange={e=>edit('ai',e.target.checked)}/><span>Prepare AI review suggestions</span></label><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button">Save meeting <ArrowRight size={16}/></button></div></form></Modal>; }
