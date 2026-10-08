import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarBlank as CalendarDays, CalendarPlus, CheckCircle as CheckCircle2, Plus, Sparkle as Sparkles, Trash, X } from '@phosphor-icons/react';
import { AREAS } from '../../constants/workflow';
import { localToday, dateLabel, groupDateLabel, shortDate } from '../../lib/dates';
import { statusFor, extractNotes } from '../../lib/helpers';
import { PageHeading, Empty, DatePicker, Modal } from '../common/ui';
import { TextField, TextAreaField } from '../common/Field';
import { MeetingIntelligence, OnlineMeetingModal } from './MeetingIntelligence';
import '../../workflow.css';

export function Meetings({ readOnly = false, isAdmin = false, meetings = [], reviews = [], addMeeting, addReview, onMeetingUpdated, onDeleteMeeting, setToast, setModal, onNewMeeting, onTasksCreated, onOpen }) {
  const safeMeetings = Array.isArray(meetings) ? meetings : [];
  const [selected, setSelected] = useState(safeMeetings[0]?.id);
  const [dateFilter, setDateFilter] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const meeting = safeMeetings.find(m => m.id === selected) || safeMeetings[0];
  const [drafts, setDrafts] = useState([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [onlineOpen, setOnlineOpen] = useState(false);
  useEffect(() => {
    const existing = reviews.some(item => item.meetingId === meeting?.id);
    setDrafts(meeting && !existing && !readOnly ? extractNotes(meeting.notes || '') : []);
    setTaskError('');
  }, [meeting?.id, readOnly]);
  useEffect(() => { setNotesOpen(false); }, [meeting?.id, readOnly]);
  const visible = safeMeetings.filter(m => !dateFilter || m.date === dateFilter);
  const groups = useMemo(() => {
    const map = new Map();
    [...visible].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).forEach(m => {
      const date = m.date || '';
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(m);
    });
    return [...map.entries()];
  }, [visible]);
  const createDrafts = async () => {
    if (creatingTasks || !drafts.length) return;
    setCreatingTasks(true); setTaskError('');
    const titles = drafts.filter(title => title.trim());
    try {
      const results = await Promise.allSettled(titles.map(title => addReview({ title: title.trim(), area: 'Engineering', priority: 'Major', stage: 'Planning', status: 'Open', assignee: '', assignees: [], due: '', meetingId: meeting.id })));
      const failed = titles.filter((_, index) => results[index].status === 'rejected');
      setDrafts(failed);
      const count = titles.length - failed.length;
      if (count) onTasksCreated(count);
      if (failed.length) setTaskError(`${failed.length} task(s) failed. Your remaining drafts are kept for retry.`);
    } finally { setCreatingTasks(false); }
  };
  const noteLines = meeting ? String(meeting.notes || '').split('\n').map(s => s.trim()).filter(Boolean) : [];
  const meetingReviews = useMemo(() => reviews.filter(item => item.meetingId === meeting?.id), [reviews, meeting?.id]);
  const actionGroups = useMemo(() => {
    const items = [
      ...drafts.map((title, index) => ({ id: `draft-${index}`, title, area: 'Meeting Notes', priority: index === 0 ? 'Major' : 'Minor', status: 'Open', due: '', draft: true, index })),
      ...meetingReviews.map(item => ({ ...item, draft: false }))
    ];
    const grouped = new Map();
    items.forEach(item => {
      const name = item.assignee || 'Unassigned';
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(item);
    });
    return [...grouped.entries()];
  }, [drafts, meetingReviews]);
  return <section className="page meetings-page"><PageHeading title="Meetings" action={<div className="flex flex-wrap gap-2"><button disabled={readOnly} className="secondary-button" onClick={()=>setOnlineOpen(true)}><CalendarPlus size={16}/> Online meeting</button><button disabled={readOnly} className="primary-button" onClick={onNewMeeting}><CalendarPlus size={16}/> New meeting</button></div>}/>
    {onlineOpen && <OnlineMeetingModal onClose={()=>setOnlineOpen(false)} onSave={async input=>{const saved=await addMeeting(input);setSelected(saved.id);setOnlineOpen(false);setToast('Meeting saved. Connect the notetaker from its details.');}}/>}
    <div className="meetings-layout">
      <div className="meetings-side">
        <div><button className="date-filter" onClick={() => setPickerOpen(true)}><CalendarDays size={15}/> {dateFilter ? groupDateLabel(dateFilter) : 'Filter by date'}</button>{dateFilter && <button className="date-clear-text" onClick={() => setDateFilter('')}>Clear</button>}</div>
        {pickerOpen && <Modal className="modal meeting-date-modal" title="Filter meetings by date" subtitle="Choose a date to filter your meetings." onClose={() => setPickerOpen(false)}><DatePicker value={dateFilter} onPick={iso => { setDateFilter(iso); setPickerOpen(false); }} onClear={() => { setDateFilter(''); setPickerOpen(false); }} /></Modal>}
        {groups.length ? groups.map(([date, items]) => <div key={date} className="meeting-group"><p className="meeting-group-label">{groupDateLabel(date)} · {items.length} meeting{items.length === 1 ? '' : 's'}</p>{items.map(m => <article key={m.id} className={`meeting-card${m.id === meeting?.id ? ' selected' : ''}`} onClick={() => setSelected(m.id)}><div><strong>{m.title}</strong><p><CalendarDays size={12}/> {dateLabel(m.date)}{m.ai && <span className="ai-badge"><Sparkles size={11}/> AI</span>}</p></div><div className="meeting-card-actions"><button disabled={readOnly} onClick={e => { e.stopPropagation(); onDeleteMeeting(m.id); }} aria-label={`Delete ${m.title}`}><Trash size={15}/></button></div></article>)}</div>) : <Empty text="No meetings found."/>}
      </div>
      {meeting && <aside className="meeting-detail-card">
        <div className="meeting-detail-body"><h2>{meeting.title}</h2><p className="meeting-detail-date"><CalendarDays size={13}/> {groupDateLabel(meeting.date)}</p><div className="notes-head"><p className="detail-label">ISI RAPAT</p>{noteLines.length > 5 && <button type="button" className="text-button notes-toggle" onClick={() => setNotesOpen(true)}>View details</button>}</div>{noteLines.length ? <ul className="notes-lines notes-clamp">{noteLines.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p className="notes-empty">No notes yet.</p>}</div>
        {notesOpen && <Modal className="modal notes-modal" title={`Meeting notes — ${meeting.title}`} subtitle="Full meeting notes" onClose={() => setNotesOpen(false)}><p className="meeting-detail-date"><CalendarDays size={13}/> {groupDateLabel(meeting.date)}</p><ul className="notes-lines notes-full">{noteLines.map((line, i) => <li key={i}>{line}</li>)}</ul></Modal>}
        <MeetingIntelligence key={meeting.id} meeting={meeting} readOnly={readOnly} isAdmin={isAdmin} onToast={setToast} onMeetingUpdated={onMeetingUpdated}/>
        <div className="meeting-actions"><div className="meeting-actions-head"><h3>Action items</h3><span>{drafts.length + meetingReviews.length} item{drafts.length + meetingReviews.length === 1 ? '' : 's'}</span><button className="add-task-btn" disabled={readOnly || !drafts.length || creatingTasks} onClick={createDrafts}><Plus size={14}/> {creatingTasks ? 'Creating…' : 'Add task'}</button></div>{taskError && <p className="form-error" role="alert">{taskError}</p>}{actionGroups.length ? <div className="meeting-action-groups">{actionGroups.map(([assignee, items]) => <section className="meeting-action-group" key={assignee}><header><span className="meeting-action-avatar">{assignee === 'Unassigned' ? 'U' : assignee.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span><strong>{assignee}</strong><span className="meeting-action-count">{items.length} task{items.length === 1 ? '' : 's'}</span></header><div className="meeting-action-table-wrap"><table className="meeting-action-table"><thead><tr><th>Task Name</th><th>Requested by</th><th>Severity</th><th>Status</th><th>Due</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.draft ? <label className="meeting-draft-title"><CheckCircle2 size={16}/><input className="field-input" aria-label={`Draft task ${item.index + 1}`} value={item.title} onChange={event => setDrafts(previous => previous.map((value, index) => index === item.index ? event.target.value : value))} /></label> : <button className="meeting-action-title" onClick={() => onOpen && onOpen(item)}>{item.title}</button>}</td><td className="muted" data-label="Requested by">{meeting.title || 'Meeting Notes'}</td><td data-label="Severity"><span className={`severity severity-${String(item.priority || 'Minor').toLowerCase()}`}><i />{item.priority || 'Minor'}</span></td><td data-label="Status"><span className="meeting-status-pill"><i />{statusFor(item)}</span></td><td className="muted" data-label="Due">{item.due ? shortDate(item.due) : '—'}</td></tr>)}</tbody></table></div></section>)}</div> : <div className="draft-empty"><span className="draft-empty-icon"><Sparkles size={17}/></span><strong>No action items yet</strong><p>Write clear action lines in the notes above to generate drafts.</p></div>}</div>
      </aside>}
    </div></section>;
}


export function MeetingModal({ onClose, onSave }) {
  const [form, setForm] = useState({ title:'', date:localToday(), notes:'', ai:true });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const edit = (key, value) => setForm(previous => ({ ...previous, [key]:value }));
  const submit = async event => {
    event.preventDefault();
    if (pending || !form.title.trim()) return;
    setPending(true); setError('');
    try { await onSave({ ...form, title:form.title.trim() }); }
    catch (failure) { setError(failure.message || 'Meeting could not be saved. Please try again.'); }
    finally { setPending(false); }
  };
  return <Modal pending={pending} title="New meeting" subtitle="Notes are saved to this project and can generate review items." onClose={onClose}>
    <form onSubmit={submit}><TextField label="Meeting title" autoFocus value={form.title} onChange={event=>edit('title',event.target.value)} placeholder="e.g. Design review" required/><TextField label="Date" type="date" value={form.date} onChange={event=>edit('date',event.target.value)}/><TextAreaField label="Notes" rows={6} value={form.notes} onChange={event=>edit('notes',event.target.value)} placeholder="One decision or action per line"/><label className="switch-label"><input type="checkbox" checked={form.ai} onChange={event=>edit('ai',event.target.checked)}/><span>Prepare AI review suggestions</span></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button disabled={pending} type="button" className="text-button" onClick={onClose}>Cancel</button><button disabled={pending || !form.title.trim()} className="primary-button">{pending ? 'Saving…' : 'Save meeting'} <ArrowRight size={16}/></button></div></form>
  </Modal>;
}
