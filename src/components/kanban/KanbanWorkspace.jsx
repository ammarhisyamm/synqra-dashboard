import { useMemo, useState } from 'react';
import {
  CalendarBlank, CaretDown, CaretRight, Funnel, Kanban, ListBullets,
  MagnifyingGlass, Plus, Rows, SquaresFour, Tag, Target, Timer, Trash, User, Users
} from '@phosphor-icons/react';
import { PRIORITIES, STAGES } from '../../constants/workflow';
import './kanban-workspace.css';

const todayIso = () => new Date().toISOString().slice(0, 10);
const statusFor = task => task.status || (task.stage === 'Completed' ? 'Resolved' : task.stage === 'In Progress' ? 'In Progress' : task.stage === 'Final' ? 'Review' : 'Open');
const done = task => task.stage === 'Completed' || statusFor(task) === 'Resolved';
const toDate = value => { const parsed = new Date(`${value || todayIso()}T12:00:00`); return Number.isFinite(parsed.getTime()) ? parsed : new Date(); };
const iso = value => value.toISOString().slice(0, 10);
const daysBetween = (start, end) => Math.round((toDate(end) - toDate(start)) / 86400000);
const labelDate = value => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(toDate(value)) : 'No date';

function TaskMeta({ task }) {
  const labels = Array.isArray(task.labels) ? task.labels : [];
  return <span className="kanban-task-meta">{task.epic && <em>{task.epic}</em>}{task.feature && <em>{task.feature}</em>}{labels.slice(0, 1).map(label => <em key={label}>{label}</em>)}</span>;
}

function SprintCreateModal({ onClose, onCreate }) {
  const start = todayIso();
  const end = iso(new Date(Date.now() + 13 * 86400000));
  const [form, setForm] = useState({ name: '', goal: '', startDate: start, endDate: end, status: 'planned' });
  const submit = async event => {
    event.preventDefault();
    if (!form.name.trim()) return;
    try {
      await onCreate(form);
      onClose();
    } catch {
      // The parent restores optimistic state and presents the error toast.
    }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="sprint-modal" onMouseDown={event => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
    <span className="sprint-modal-icon"><Timer size={21}/></span><h2>Create sprint</h2><p>Set a goal and schedule, then pull tasks in from the backlog.</p>
    <form onSubmit={submit}><label>Sprint name<input autoFocus value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Sprint 4" required/></label><label>Goal<input value={form.goal} onChange={event => setForm({ ...form, goal: event.target.value })} placeholder="What should this sprint achieve?"/></label><div className="form-grid"><label>Start date<input type="date" value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })}/></label><label>End date<input type="date" value={form.endDate} min={form.startDate} onChange={event => setForm({ ...form, endDate: event.target.value })}/></label></div><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button">Create sprint</button></div></form>
  </section></div>;
}

function TaskRow({ task, onOpen, action, actionLabel, muted = false }) {
  return <div className={`sprint-task-row${muted ? ' muted' : ''}`}>
    <button className="sprint-task-main" onClick={() => onOpen(task)}><span className="task-priority-dot"/><span className="task-key">{task.key || 'TASK'}</span><strong>{task.title}</strong><TaskMeta task={task}/><span className="task-assignee">{task.assignee ? task.assignee.slice(0, 2).toUpperCase() : 'U'}</span></button>
    {action && <button className="sprint-task-action" onClick={action}>{actionLabel}</button>}
  </div>;
}

function SprintPlanning({ tasks, sprints, onOpen, onUpdateTask, onUpdateSprint, onCreateSprint }) {
  const [openSprint, setOpenSprint] = useState(() => new Set((sprints || []).filter(s => s.status !== 'completed').map(s => s.id)));
  const [addingTo, setAddingTo] = useState(null);
  const [creating, setCreating] = useState(false);
  const toggle = id => setOpenSprint(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const unplanned = tasks.filter(task => !task.sprintId && !task.sprint);
  const allSprints = [...sprints].sort((a, b) => (a.status === 'active' ? -1 : a.status === 'completed' ? 1 : 0) - (b.status === 'active' ? -1 : b.status === 'completed' ? 1 : 0));
  return <section className="sprint-planning">
    <div className="sprint-planning-head"><div><h2>Sprint planning</h2><p>Create sprints, then move tasks from the backlog.</p></div><button className="primary-button" onClick={() => setCreating(true)}><Plus size={16}/> Create sprint</button></div>
    {allSprints.map(sprint => {
      const items = tasks.filter(task => task.sprintId === sprint.id || (!task.sprintId && task.sprint === sprint.name));
      const completed = items.filter(done).length;
      const progress = items.length ? Math.round(completed / items.length * 100) : 0;
      const expanded = openSprint.has(sprint.id);
      return <article className={`sprint-plan-card ${expanded ? 'expanded' : ''}`} key={sprint.id}>
        <header><button className="sprint-collapse" onClick={() => toggle(sprint.id)} aria-label={`Toggle ${sprint.name}`}>{expanded ? <CaretDown size={18}/> : <CaretRight size={18}/>}</button><div className="sprint-plan-title"><strong>{sprint.name}</strong><span className={`sprint-state ${sprint.status}`}>{sprint.status}</span><small>{labelDate(sprint.startDate)} – {labelDate(sprint.endDate)}</small></div><div className="sprint-plan-progress"><span><i style={{ width: `${progress}%` }}/></span><small>{completed}/{items.length}</small></div><button className="text-button sprint-status" onClick={() => onUpdateSprint(sprint.id, { status: sprint.status === 'completed' ? 'planned' : sprint.status === 'active' ? 'completed' : 'active' })}>{sprint.status === 'active' ? 'Complete' : sprint.status === 'completed' ? 'Reopen' : 'Activate'}</button><button className="text-button" onClick={() => setAddingTo(addingTo === sprint.id ? null : sprint.id)}><Plus size={15}/> Add</button></header>
        {expanded && <div className="sprint-plan-body">{items.length ? items.map(task => <TaskRow key={task.id} task={task} onOpen={onOpen} action={() => onUpdateTask(task.id, { sprintId: '', sprint: '' })} actionLabel="Backlog"/>) : <p className="sprint-empty">No tasks in this sprint yet.</p>}{addingTo === sprint.id && <div className="sprint-add-backlog"><span>Backlog tasks</span>{unplanned.length ? unplanned.map(task => <TaskRow key={task.id} task={task} onOpen={onOpen} action={() => { onUpdateTask(task.id, { sprintId: sprint.id, sprint: sprint.name }); setAddingTo(null); }} actionLabel="Add" muted/>) : <p>Backlog is clear.</p>}</div>}</div>}
      </article>;
    })}
    <article className="backlog-card"><header><div><strong>Backlog</strong><small>{unplanned.length} task{unplanned.length === 1 ? '' : 's'} not scheduled</small></div></header>{unplanned.length ? unplanned.map(task => <div className="backlog-task" key={task.id}><TaskRow task={task} onOpen={onOpen}/><label>Move to sprint<select value="" onChange={event => { const sprint = allSprints.find(item => item.id === event.target.value); if (sprint) onUpdateTask(task.id, { sprintId: sprint.id, sprint: sprint.name }); }}><option value="">Select sprint</option>{allSprints.filter(s => s.status !== 'completed').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>) : <p className="sprint-empty">No backlog tasks.</p>}</article>
    {creating && <SprintCreateModal onClose={() => setCreating(false)} onCreate={onCreateSprint}/>} 
  </section>;
}

function Timeline({ tasks, onOpen }) {
  const dated = tasks.filter(task => task.startDate || task.due);
  const earliest = dated.length ? dated.reduce((value, task) => Math.min(value, toDate(task.startDate || task.due).getTime()), Infinity) : Date.now();
  const start = new Date(earliest); start.setHours(12, 0, 0, 0);
  const dates = Array.from({ length: 14 }, (_, index) => iso(new Date(start.getTime() + index * 86400000)));
  const grouped = tasks.reduce((result, task) => { const key = task.epic || 'Ungrouped tasks'; (result[key] ||= []).push(task); return result; }, {});
  return <section className="timeline-board"><div className="timeline-scroll"><div className="timeline-head"><strong>Task</strong><div>{dates.map(date => <span key={date}>{toDate(date).getDate()}</span>)}</div></div>{Object.entries(grouped).map(([epic, items]) => <div className="timeline-group" key={epic}><strong className="timeline-group-label"><i/>{epic}</strong>{items.map(task => { const taskStart = task.startDate || task.due || dates[0]; const taskEnd = task.due || task.startDate || taskStart; const offset = Math.max(0, Math.min(13, daysBetween(dates[0], taskStart))); const span = Math.max(1, Math.min(14 - offset, daysBetween(taskStart, taskEnd) + 1)); return <div className="timeline-row" key={task.id}><button onClick={() => onOpen(task)}><span>{task.key || 'TASK'}</span><strong>{task.title}</strong><small>{task.assignee || 'Unassigned'}</small></button><div className="timeline-track">{dates.map(date => <i key={date}/>) }<button className="timeline-bar" style={{ gridColumn: `${offset + 1} / span ${span}` }} onClick={() => onOpen(task)} title={`${task.title} · ${labelDate(taskStart)} – ${labelDate(taskEnd)}`}>{span > 2 && task.title}</button></div></div>; })}</div>)}</div></section>;
}

export function KanbanWorkspace({ reviews, sprints, updateReview, createSprint, updateSprint, setModal, onOpen }) {
  const [view, setView] = useState('board');
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [epic, setEpic] = useState('');
  const [feature, setFeature] = useState('');
  const [label, setLabel] = useState('');
  const [dragId, setDragId] = useState(null);
  const owners = useMemo(() => [...new Set(reviews.map(task => task.assignee).filter(Boolean))], [reviews]);
  const epics = useMemo(() => [...new Set(reviews.map(task => task.epic).filter(Boolean))], [reviews]);
  const features = useMemo(() => [...new Set(reviews.map(task => task.feature).filter(Boolean))], [reviews]);
  const labels = useMemo(() => [...new Set(reviews.flatMap(task => Array.isArray(task.labels) ? task.labels : []))], [reviews]);
  const filtered = useMemo(() => reviews.filter(task => {
    const text = `${task.title} ${task.key || ''} ${task.description || ''}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (!assignee || task.assignee === assignee) && (!status || statusFor(task) === status) && (!priority || task.priority === priority) && (!epic || task.epic === epic) && (!feature || task.feature === feature) && (!label || (task.labels || []).includes(label));
  }), [reviews, search, assignee, status, priority, epic, feature, label]);
  const hasFilters = search || assignee || status || priority || epic || feature || label;
  const drop = stage => ({ onDragOver: event => event.preventDefault(), onDrop: event => { event.preventDefault(); if (dragId) updateReview(dragId, { stage }); setDragId(null); } });
  const clear = () => { setSearch(''); setAssignee(''); setStatus(''); setPriority(''); setEpic(''); setFeature(''); setLabel(''); };
  return <section className="page kanban-workspace">
    <div className="kanban-toolbar"><div className="kanban-view-tabs"><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><ListBullets size={17}/> List</button><button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}><Kanban size={17}/> Board</button><button className={view === 'planning' ? 'active' : ''} onClick={() => setView('planning')}><Rows size={17}/> Sprint planning</button><button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}><CalendarBlank size={17}/> Gantt / Timeline</button></div>
      <div className="kanban-toolbar-actions"><label className="kanban-search"><MagnifyingGlass size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Filter tasks…"/></label><label className="toolbar-select"><Users size={16}/><select value={assignee} onChange={event => setAssignee(event.target.value)}><option value="">Team</option>{owners.map(value => <option key={value}>{value}</option>)}</select></label><label className="toolbar-select"><Funnel size={16}/><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Filter</option><option>Open</option><option>In Progress</option><option>Review</option><option>Resolved</option><option>Rejected</option></select></label><label className="toolbar-select compact"><Target size={16}/><select value={epic} onChange={event => setEpic(event.target.value)}><option value="">Epics</option>{epics.map(value => <option key={value}>{value}</option>)}</select></label><label className="toolbar-select compact"><SquaresFour size={16}/><select value={feature} onChange={event => setFeature(event.target.value)}><option value="">Features</option>{features.map(value => <option key={value}>{value}</option>)}</select></label><label className="toolbar-select compact"><Tag size={16}/><select value={label} onChange={event => setLabel(event.target.value)}><option value="">Labels</option>{labels.map(value => <option key={value}>{value}</option>)}</select></label><button className="primary-button" onClick={() => setModal('review')}><Plus size={16}/> Create task</button></div>
    </div>
    <div className="kanban-filter-row"><label>Priority<select value={priority} onChange={event => setPriority(event.target.value)}><option value="">All priorities</option>{PRIORITIES.map(value => <option key={value}>{value}</option>)}</select></label>{hasFilters && <button onClick={clear}>Clear filters</button>}<span>{filtered.length} task{filtered.length === 1 ? '' : 's'} shown</span></div>
    {view === 'board' && <div className="kanban-board-grid">{STAGES.map(stage => <section className="kanban-stage" key={stage} {...drop(stage)}><header><strong>{stage}</strong><span>{filtered.filter(task => task.stage === stage).length}</span></header>{filtered.filter(task => task.stage === stage).map(task => <article className="kanban-work-card" key={task.id} draggable onDragStart={() => setDragId(task.id)} onDragEnd={() => setDragId(null)} onClick={() => onOpen(task)}><div><strong>{task.title}</strong><small>{task.key || 'TASK'} · {task.area}</small></div><TaskMeta task={task}/><footer><span className="task-priority-dot"/><small>{task.priority}</small><span className="task-avatar">{task.assignee ? task.assignee.slice(0, 1).toUpperCase() : 'U'}</span></footer></article>)}<button className="kanban-add-card" onClick={() => setModal('review')}><Plus size={15}/> Add task</button></section>)}</div>}
    {view === 'list' && <div className="kanban-list-view">{STAGES.map(stage => <section key={stage}><header><strong>{stage}</strong><span>{filtered.filter(task => task.stage === stage).length}</span></header>{filtered.filter(task => task.stage === stage).map(task => <TaskRow key={task.id} task={task} onOpen={onOpen}/>)}</section>)}</div>}
    {view === 'planning' && <SprintPlanning tasks={filtered} sprints={sprints} onOpen={onOpen} onUpdateTask={updateReview} onUpdateSprint={updateSprint} onCreateSprint={createSprint}/>} 
    {view === 'timeline' && <Timeline tasks={filtered} onOpen={onOpen}/>} 
  </section>;
}
