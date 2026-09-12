import { useEffect, useMemo, useState } from 'react';
import {
  Archive, CalendarBlank, CaretDown, CaretRight, Funnel, Kanban, ListBullets,
  MagnifyingGlass, PencilSimple as Pencil, Plus, Rows, SquaresFour, Stack, Tag, Timer, Trash, User, Users, X
} from '@phosphor-icons/react';
import { PRIORITIES, STAGES } from '../../constants/workflow';
import { metadataApi } from '../../api/metadata';
import { AppSelect } from '../common/AppSelect';
import { MultiCheckSelect, AssigneeOption, PriorityOption } from '../common/MultiCheckSelect';
import { TextField } from '../common/Field';
import './kanban-workspace.css';
import './metadata.css';

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

const METADATA_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];
const isArchivedMeta = item => item?.status === 'archived' || item?.archived === 1 || item?.archived === true;

function MetadataManager({ projectId, projectName, metadata, taskCounts = {}, initialType = 'epic', onClose, onRefresh, requestConfirm, onToast }) {
  const [type, setType] = useState(initialType);
  const [name, setName] = useState('');
  const [color, setColor] = useState(METADATA_COLORS[0]);
  const [parentId, setParentId] = useState('');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setQuery(''); setEditingId(null); setColor(METADATA_COLORS[0]); }, [type]);
  useEffect(() => { if (initialType) setType(initialType); }, [initialType]);
  const items = metadata.filter(item => item.type === type);
  const visible = items.filter(item => {
    if (!showArchived && isArchivedMeta(item)) return false;
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const activeCount = items.filter(item => !isArchivedMeta(item)).length;
  const archivedCount = items.length - activeCount;
  const epics = metadata.filter(item => item.type === 'epic' && !isArchivedMeta(item));
  const parentOptions = [{ value: '', label: 'No parent epic' }, ...epics.map(item => ({ value: item.id, label: item.name }))];
  const parentName = id => epics.find(item => item.id === id)?.name || metadata.find(item => item.id === id)?.name || '';
  const countFor = item => taskCounts[`${item.type}:${item.name}`] || 0;
  const fail = error => { const message = error?.message || 'Something didn’t finish. Try again.'; if (onToast) onToast(message); };
  const save = async event => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await metadataApi.create({ projectId, type, name: name.trim(), color, parentId: type === 'feature' ? parentId : '' });
      setName(''); setParentId(''); setColor(METADATA_COLORS[0]);
      await onRefresh();
    } catch (error) { fail(error); } finally { setBusy(false); }
  };
  const toggleArchive = async item => {
    try { await metadataApi.update(item.id, { archived: !isArchivedMeta(item) }); await onRefresh(); }
    catch (error) { fail(error); }
  };
  const commitRename = async item => {
    const next = editingName.trim();
    setEditingId(null);
    if (!next || next === item.name) return;
    try { await metadataApi.update(item.id, { name: next }); await onRefresh(); }
    catch (error) { fail(error); }
  };
  const doRemove = async item => { try { await metadataApi.remove(item.id); await onRefresh(); } catch (error) { fail(error); } };
  const remove = item => {
    if (requestConfirm) {
      requestConfirm({ danger: true, icon: <Trash size={24} />, title: `Delete ${item.name} permanently?`, subtitle: `${countFor(item)} task${countFor(item) === 1 ? '' : 's'} use this ${type}. Existing tasks keep their current value.`, confirmLabel: 'Delete permanently', onConfirm: () => doRemove(item) });
      return;
    }
    if (!confirm(`Delete ${item.name} permanently? Existing tasks keep their current value.`)) return;
    doRemove(item);
  };
  const copy = { epic: { title: `Manage epics${projectName ? ` — ${projectName}` : ''}`, desc: 'Buat, ubah, arsipkan (soft delete), atau hapus permanen epic untuk project ini.', placeholder: 'Nama epic baru…' }, feature: { title: 'Manage features', desc: 'Buat, ubah, arsipkan, atau hapus permanen feature di bawah epic yang dipilih.', placeholder: 'Nama feature baru…' }, label: { title: `Manage labels${projectName ? ` — ${projectName}` : ''}`, desc: 'Buat label custom seperti Bug, Enhancement, atau New Feature untuk mengkategorikan task.', placeholder: 'Label name (e.g. Bug, Enhancement)…' } }[type];
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="metadata-modal" role="dialog" aria-modal="true" aria-labelledby="metadata-dialog-title" onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={19}/></button><span className="sprint-modal-icon"><Tag size={20}/></span><h2 id="metadata-dialog-title">{copy.title}</h2><p>{copy.desc}</p><div className="metadata-tabs">{['epic','feature','label'].map(item => <button type="button" key={item} className={type === item ? 'active' : ''} onClick={() => setType(item)}>{item}s <span className="metadata-tab-count">{metadata.filter(entry => entry.type === item && !isArchivedMeta(entry)).length}</span></button>)}</div><form onSubmit={save} className="metadata-create"><input value={name} onChange={event => setName(event.target.value)} placeholder={copy.placeholder} autoFocus aria-label={`New ${type} name`}/><div className="metadata-color-row" role="radiogroup" aria-label={`${type} color`}>{METADATA_COLORS.map(option => <button key={option} type="button" className={`metadata-color${color === option ? ' selected' : ''}`} style={{ background: option }} aria-label={`Use color ${option}`} aria-pressed={color === option} onClick={() => setColor(option)}/>)}</div>{type === 'feature' && <AppSelect value={parentId} options={parentOptions} onChange={setParentId} placeholder="Select epic…" ariaLabel="Parent epic"/>}<button className="primary-button" disabled={busy || !name.trim()}><Plus size={15}/> Add</button></form><div className="metadata-tools"><label className="metadata-search"><MagnifyingGlass size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${type}s…`} aria-label={`Search ${type}s`}/></label><button type="button" className={`metadata-archive-toggle${showArchived ? ' active' : ''}`} onClick={() => setShowArchived(value => !value)}><Archive size={14}/> Archived ({archivedCount})</button></div><div className="metadata-list">{visible.length ? visible.map(item => { const archived = isArchivedMeta(item); const tasks = countFor(item); return <div key={item.id} className={archived ? 'archived' : ''}><span className="metadata-row-main"><i style={{ background: item.color || METADATA_COLORS[0] }}/>{editingId === item.id ? <input className="metadata-rename" value={editingName} autoFocus onChange={event => setEditingName(event.target.value)} onBlur={() => commitRename(item)} onKeyDown={event => { if (event.key === 'Enter') commitRename(item); if (event.key === 'Escape') setEditingId(null); }} aria-label={`Rename ${item.name}`}/> : <strong>{item.name}</strong>}{type === 'feature' && item.parentId && parentName(item.parentId) && <small> · {parentName(item.parentId)}</small>}<small className="metadata-task-count">{tasks} task{tasks === 1 ? '' : 's'}</small>{archived && <small className="metadata-archived-pill">archived</small>}</span><span className="metadata-row-actions"><button type="button" onClick={() => { setEditingId(item.id); setEditingName(item.name); }} aria-label={`Rename ${item.name}`} title="Rename"><Pencil size={15}/></button><button type="button" onClick={() => toggleArchive(item)} aria-label={archived ? `Restore ${item.name}` : `Archive ${item.name}`} title={archived ? 'Restore' : 'Archive'}><Archive size={15}/></button><button type="button" className="danger" onClick={() => remove(item)} aria-label={`Delete ${item.name} permanently`} title="Delete permanently"><Trash size={15}/></button></span></div>; }) : <p>{query ? `No ${type}s match “${query}”.` : archivedCount && !showArchived ? `No active ${type}s. Toggle Archived to restore items.` : `No ${type}s yet. Create your first ${type} above.`}</p>}</div><div className="modal-actions"><span className="metadata-footnote">{activeCount} active · {archivedCount} archived</span><button type="button" className="text-button" onClick={onClose}>Close</button></div></section></div>;
}

function SprintCreateModal({ onClose, onCreate }) {
  const start = todayIso();
  const end = iso(new Date(Date.now() + 13 * 86400000));
  const [form, setForm] = useState({ name: '', goal: '', startDate: start, endDate: end, status: 'planned' });
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
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
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="sprint-modal" role="dialog" aria-modal="true" aria-labelledby="sprint-dialog-title" onMouseDown={event => event.stopPropagation()}>
    <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={19}/></button>
    <span className="sprint-modal-icon"><Timer size={21}/></span><h2 id="sprint-dialog-title">Create sprint</h2><p>Set a goal and schedule, then pull tasks in from the backlog.</p>
    <form onSubmit={submit}><TextField label="Sprint name" autoFocus value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Sprint 4" required/><TextField label="Goal" value={form.goal} onChange={event => setForm({ ...form, goal: event.target.value })} placeholder="What should this sprint achieve?"/><div className="form-grid"><TextField label="Start date" type="date" value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })}/><TextField label="End date" type="date" min={form.startDate} value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })}/></div><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button">Create sprint</button></div></form>
  </section></div>;
}

function TaskRow({ task, onOpen, action, actionLabel, muted = false, draggable = false, onDragStart }) {
  return <div className={`sprint-task-row${muted ? ' muted' : ''}`}>
    <button className="sprint-task-main" draggable={draggable} onDragStart={onDragStart} onClick={() => onOpen(task)}><span className="task-priority-dot"/><span className="task-key">{task.key || 'TASK'}</span><strong>{task.title}</strong><TaskMeta task={task}/><span className="task-assignee">{task.assignee ? task.assignee.slice(0, 2).toUpperCase() : 'U'}</span></button>
    {action && <button className="sprint-task-action" onClick={action}>{actionLabel}</button>}
  </div>;
}

function SprintPlanning({ tasks, sprints, onOpen, onUpdateTask, onUpdateSprint, onCreateSprint }) {
  const [openSprint, setOpenSprint] = useState(() => new Set((sprints || []).filter(s => s.status !== 'completed').map(s => s.id)));
  const [addingTo, setAddingTo] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dragTaskId, setDragTaskId] = useState(null);
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
      return <article className={`sprint-plan-card ${expanded ? 'expanded' : ''}`} key={sprint.id} onDragOver={event => event.preventDefault()} onDrop={() => { const task = tasks.find(item => item.id === dragTaskId); if (task) onUpdateTask(task.id, { sprintId: sprint.id, sprint: sprint.name }); setDragTaskId(null); }}>
        <header><button className="sprint-collapse" onClick={() => toggle(sprint.id)} aria-label={`Toggle ${sprint.name}`}>{expanded ? <CaretDown size={18}/> : <CaretRight size={18}/>}</button><div className="sprint-plan-title"><strong>{sprint.name}</strong><span className={`sprint-state ${sprint.status}`}>{sprint.status}</span><small>{labelDate(sprint.startDate)} – {labelDate(sprint.endDate)}</small></div><div className="sprint-plan-progress"><span><i style={{ width: `${progress}%` }}/></span><small>{completed}/{items.length}</small></div><button className="text-button sprint-status" onClick={() => onUpdateSprint(sprint.id, { status: sprint.status === 'completed' ? 'planned' : sprint.status === 'active' ? 'completed' : 'active' })}>{sprint.status === 'active' ? 'Complete' : sprint.status === 'completed' ? 'Reopen' : 'Activate'}</button><button className="text-button" onClick={() => setAddingTo(addingTo === sprint.id ? null : sprint.id)}><Plus size={15}/> Add</button></header>
        {expanded && <div className="sprint-plan-body">{items.length ? items.map(task => <TaskRow key={task.id} task={task} onOpen={onOpen} draggable onDragStart={() => setDragTaskId(task.id)} action={() => onUpdateTask(task.id, { sprintId: '', sprint: '' })} actionLabel="Backlog"/>) : <p className="sprint-empty">No tasks in this sprint yet.</p>}{addingTo === sprint.id && <div className="sprint-add-backlog"><span>Backlog tasks</span>{unplanned.length ? unplanned.map(task => <TaskRow key={task.id} task={task} onOpen={onOpen} action={() => { onUpdateTask(task.id, { sprintId: sprint.id, sprint: sprint.name }); setAddingTo(null); }} actionLabel="Add" muted/>) : <p>Backlog is clear.</p>}</div>}</div>}
      </article>;
    })}
    <article className="backlog-card" onDragOver={event => event.preventDefault()} onDrop={() => { const task = tasks.find(item => item.id === dragTaskId); if (task) onUpdateTask(task.id, { sprintId: '', sprint: '' }); setDragTaskId(null); }}><header><div><strong>Backlog</strong><small>{unplanned.length} task{unplanned.length === 1 ? '' : 's'} not scheduled</small></div></header>{unplanned.length ? unplanned.map(task => <div className="backlog-task" key={task.id}><TaskRow task={task} onOpen={onOpen} draggable onDragStart={() => setDragTaskId(task.id)}/><label>Move to sprint<AppSelect value="" options={[{ value: '', label: 'Select sprint' }, ...allSprints.filter(s => s.status !== 'completed').map(s => ({ value: s.id, label: s.name }))]} onChange={val => { const sprint = allSprints.find(item => item.id === val); if (sprint) onUpdateTask(task.id, { sprintId: sprint.id, sprint: sprint.name }); }} placeholder="Select sprint" ariaLabel="Move to sprint"/></label></div>) : <p className="sprint-empty">No backlog tasks.</p>}</article>
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

export function KanbanWorkspace({ project, team = [], reviews, sprints = [], metadata = [], projectId, updateReview, createSprint, updateSprint, refreshMetadata, setModal, onOpen, requestConfirm, onToast, onProjectClick }) {
  const teamNames = team.map(t => t.name);
  const [view, setView] = useState('board');
  const [search, setSearch] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [epicFilter, setEpicFilter] = useState([]);
  const [featureFilter, setFeatureFilter] = useState([]);
  const [labelFilter, setLabelFilter] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [metadataType, setMetadataType] = useState('epic');

  const owners = useMemo(() => teamNames.length ? teamNames : [...new Set(reviews.map(task => task.assignee).filter(Boolean))], [teamNames, reviews]);
  const ownerEmails = useMemo(() => { const map = {}; team.forEach(member => { if (member?.name) map[member.name] = member.email || ''; }); return map; }, [team]);
  const activeMetadata = useMemo(() => metadata.filter(item => !isArchivedMeta(item)), [metadata]);
  const epics = useMemo(() => [...new Set([...activeMetadata.filter(item => item.type === 'epic').map(item => item.name), ...reviews.map(task => task.epic).filter(Boolean)])], [activeMetadata, reviews]);
  const features = useMemo(() => [...new Set([...activeMetadata.filter(item => item.type === 'feature').map(item => item.name), ...reviews.map(task => task.feature).filter(Boolean)])], [activeMetadata, reviews]);
  const labels = useMemo(() => [...new Set([...activeMetadata.filter(item => item.type === 'label').map(item => item.name), ...reviews.flatMap(task => Array.isArray(task.labels) ? task.labels : [])])], [activeMetadata, reviews]);
  const taskCounts = useMemo(() => {
    const counts = {};
    reviews.forEach(task => {
      if (task.epic) counts[`epic:${task.epic}`] = (counts[`epic:${task.epic}`] || 0) + 1;
      if (task.feature) counts[`feature:${task.feature}`] = (counts[`feature:${task.feature}`] || 0) + 1;
      (Array.isArray(task.labels) ? task.labels : []).forEach(label => { counts[`label:${label}`] = (counts[`label:${label}`] || 0) + 1; });
    });
    return counts;
  }, [reviews]);

  const filtered = useMemo(() => reviews.filter(task => {
    const text = `${task.title} ${task.key || ''} ${task.description || ''}`.toLowerCase();
    const taskLabels = Array.isArray(task.labels) ? task.labels : [];
    return (!search || text.includes(search.toLowerCase()))
      && (!assignees.length || assignees.some(name => (Array.isArray(task.assignees) && task.assignees.length ? task.assignees : [task.assignee]).includes(name)))
      && (!statuses.length || statuses.includes(statusFor(task)))
      && (!priorities.length || priorities.includes(task.priority))
      && (!epicFilter.length || epicFilter.includes(task.epic || ''))
      && (!featureFilter.length || featureFilter.includes(task.feature || ''))
      && (!labelFilter.length || labelFilter.some(label => taskLabels.includes(label)));
  }), [reviews, search, assignees, statuses, priorities, epicFilter, featureFilter, labelFilter]);

  const hasFilters = search || assignees.length || statuses.length || priorities.length || epicFilter.length || featureFilter.length || labelFilter.length;
  const activeFilterCount = assignees.length + statuses.length + priorities.length + epicFilter.length + featureFilter.length + labelFilter.length;
  const drop = stage => ({ onDragOver: event => event.preventDefault(), onDrop: event => { event.preventDefault(); if (dragId) updateReview(dragId, { stage }); setDragId(null); } });
  const clear = () => { setSearch(''); setAssignees([]); setStatuses([]); setPriorities([]); setEpicFilter([]); setFeatureFilter([]); setLabelFilter([]); };
  const openMetadata = type => { setMetadataType(type); setMetadataOpen(true); };

  const statusChoices = ['Open', 'In Progress', 'Review', 'Resolved', 'Rejected'];
  const epicColor = name => activeMetadata.find(item => item.type === 'epic' && item.name === name)?.color;
  const labelColor = name => activeMetadata.find(item => item.type === 'label' && item.name === name)?.color || '#111b30';

  const activeSprint = sprints.find(s => s.status === 'active') || sprints[0];

  return <section className="page kanban-workspace">
    {/* Row 1: Project and board actions */}
    <div className="kanban-header-bar">
      <div className="kanban-toolbar-actions">
        <button type="button" className="secondary-button kanban-project-trigger" onClick={onProjectClick} aria-haspopup="dialog" title="Switch project">
          <span>{project?.name || 'Board'}</span>
          <CaretDown size={15} />
        </button>
        <MultiCheckSelect
          prefix={
            owners.length > 0 ? (
              <span className="team-avatar-stack">
                {owners.slice(0, 3).map((o, idx) => (
                  <span key={o} className={`mini-avatar avatar-bg-${idx % 3}`}>
                    {String(o).slice(0, 2).toUpperCase()}
                  </span>
                ))}
              </span>
            ) : null
          }
          icon={owners.length === 0 ? Users : undefined}
          values={assignees}
          options={owners.map((name, idx) => ({ value: name, label: name, hint: ownerEmails[name] || undefined, index: idx }))}
          onChange={setAssignees}
          placeholder="Team"
          ariaLabel="Filter by assignee"
          emptyLabel="No team members yet"
          className="toolbar-select"
          renderOption={(item, active) => <AssigneeOption name={item.label} email={item.hint} index={item.index || 0} />}
        />
        <MultiCheckSelect
          icon={Funnel}
          values={statuses}
          options={statusChoices}
          onChange={setStatuses}
          placeholder="Filter"
          ariaLabel="Filter by status"
          className="toolbar-select"
        />
        <button type="button" className="secondary-button toolbar-meta-trigger meta-epic" onClick={() => openMetadata('epic')} aria-haspopup="dialog" title="Manage epics">
          <Stack size={15}/> <span>Epics</span><span className="toolbar-count">{metadata.filter(item => item.type === 'epic' && !isArchivedMeta(item)).length}</span>
        </button>
        <button type="button" className="secondary-button toolbar-meta-trigger meta-feature" onClick={() => openMetadata('feature')} aria-haspopup="dialog" title="Manage features">
          <SquaresFour size={15}/> Features
        </button>
        <button type="button" className="secondary-button toolbar-meta-trigger meta-label" onClick={() => openMetadata('label')} aria-haspopup="dialog" title="Manage labels">
          <Tag size={15}/> Labels
        </button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button className="primary-button create-task-cta" onClick={() => setModal('review')}>
          <Plus size={16} /> Create Task
        </button>
      </div>
    </div>

    {/* Row 2: Navigation View Tabs */}
    <div className="kanban-nav-tabs-bar">
      <div className="kanban-view-tabs">
        <button className={`view-tab ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
          <ListBullets size={17}/> List
        </button>
        <button className={`view-tab ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')}>
          <Kanban size={17}/> Board
        </button>
        <button className={`view-tab ${view === 'planning' ? 'active' : ''}`} onClick={() => setView('planning')}>
          <Rows size={17}/> Sprint Planning
        </button>
        <button className={`view-tab ${view === 'timeline' ? 'active' : ''}`} onClick={() => setView('timeline')}>
          <CalendarBlank size={17}/> Gantt / Timeline
        </button>
      </div>

      <div className="kanban-filter-row">
        <div className="kanban-filter-group">
          <span>Priority</span>
          <MultiCheckSelect values={priorities} options={PRIORITIES.map(value => ({ value, label: value }))} onChange={setPriorities} placeholder="All priorities" ariaLabel="Filter by priority" className="priority-multi" renderOption={item => <PriorityOption label={item.label} />} />
        </div>
        {hasFilters && <button className="clear-filters-btn" onClick={clear}>Clear filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</button>}
        <span className="task-count-label">{filtered.length} task{filtered.length === 1 ? '' : 's'} shown</span>
      </div>
    </div>

    {view === 'board' && <div className="kanban-board-grid">{STAGES.map(stage => <section className="kanban-stage" key={stage} {...drop(stage)}><header><strong>{stage}</strong><span>{filtered.filter(task => task.stage === stage).length}</span></header>{filtered.filter(task => task.stage === stage).map(task => <article className="kanban-work-card" key={task.id} draggable onDragStart={() => setDragId(task.id)} onDragEnd={() => setDragId(null)} onClick={() => onOpen(task)}><div><strong>{task.title}</strong><small>{task.key || 'TASK'} · {task.area}</small></div><TaskMeta task={task}/><footer><span className="task-priority-dot"/><small>{task.priority}</small><span className="task-avatar">{task.assignee ? task.assignee.slice(0, 1).toUpperCase() : 'U'}</span></footer></article>)}<button className="kanban-add-card" onClick={() => setModal('review')}><Plus size={15}/> Add task</button></section>)}</div>}
    {view === 'list' && <div className="kanban-list-view">{STAGES.map(stage => <section key={stage}><header><strong>{stage}</strong><span>{filtered.filter(task => task.stage === stage).length}</span></header>{filtered.filter(task => task.stage === stage).map(task => <TaskRow key={task.id} task={task} onOpen={onOpen}/>)}</section>)}</div>}
    {view === 'planning' && <SprintPlanning tasks={filtered} sprints={sprints} onOpen={onOpen} onUpdateTask={updateReview} onUpdateSprint={updateSprint} onCreateSprint={createSprint}/>}
    {view === 'timeline' && <Timeline tasks={filtered} onOpen={onOpen}/>}
    {metadataOpen && <MetadataManager initialType={metadataType} projectId={projectId} projectName={project?.name} metadata={metadata} taskCounts={taskCounts} onClose={() => setMetadataOpen(false)} onRefresh={refreshMetadata} requestConfirm={requestConfirm} onToast={onToast}/>}
  </section>;
}
