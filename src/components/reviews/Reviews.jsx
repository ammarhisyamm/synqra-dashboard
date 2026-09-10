import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowRight, DownloadSimple as Download, Plus, MagnifyingGlass as Search, User, X } from '@phosphor-icons/react';
import { AREAS, STAGES, PRIORITIES } from '../../constants/workflow';
import { slashDate } from '../../lib/dates';
import { statusFor, downloadReviewsCsv } from '../../lib/helpers';
import { AppSelect } from '../common/AppSelect';
import { StatusPill, Priority, PageHeading, MetricCard, InlineSync, Empty } from '../common/ui';

export function Reviews({ reviews, query, setQuery, updateReview, archiveReview, setModal, onOpen, sync, onRetry, teamList = [] }) {
  const teamNames = teamList.length ? teamList.map(t => t.name) : [...new Set(reviews.map(r => r.assignee).filter(Boolean))];
  const STATUS_LIST = ['Open', 'In Progress', 'Review', 'Resolved', 'Rejected'];
  const PRIORITY_RANK = { Blocker: 0, Major: 1, Minor: 2 };
  const [team, setTeam] = useState('All teams');
  const [status, setStatus] = useState('All statuses');
  const [priority, setPriority] = useState('All priorities');
  const [owner, setOwner] = useState('All owners');
  const [phase, setPhase] = useState('All phases');
  const [due, setDue] = useState('All dates');
  const [sort, setSort] = useState('Newest');
  const [pageIdx, setPageIdx] = useState(0);
  const [selected, setSelected] = useState([]);
  const today = new Date().toISOString().slice(0, 10);
  const owners = useMemo(() => [...new Set(reviews.map(r => r.assignee).filter(Boolean))], [reviews]);
  useEffect(() => { setPageIdx(0); }, [team, status, priority, owner, phase, due, sort, query]);
  const matchDue = r => due === 'All dates' ? true : due === 'Due today' ? r.due === today : due === 'Overdue' ? Boolean(r.due && r.due < today && statusFor(r) !== 'Resolved') : due === 'Upcoming' ? Boolean(r.due && r.due >= today) : !r.due;
  const filtered = reviews.filter(r =>
    (team === 'All teams' || r.area === team) &&
    (status === 'All statuses' || statusFor(r) === status) &&
    (priority === 'All priorities' || r.priority === priority) &&
    (owner === 'All owners' || r.assignee === owner) &&
    (phase === 'All phases' || r.stage === phase) &&
    matchDue(r) &&
    `${r.title} ${r.description || ''} ${r.assignee || ''}`.toLowerCase().includes(query.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'Oldest') return (a.createdAt || '').localeCompare(b.createdAt || '');
    if (sort === 'Due date') return (a.due || '9999').localeCompare(b.due || '9999');
    if (sort === 'Priority') return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (sort === 'Title A–Z') return a.title.localeCompare(b.title);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  const chips = [
    team !== 'All teams' && { key: 'team', label: team, clear: () => setTeam('All teams') },
    status !== 'All statuses' && { key: 'status', label: status, clear: () => setStatus('All statuses') },
    priority !== 'All priorities' && { key: 'priority', label: priority, clear: () => setPriority('All priorities') },
    owner !== 'All owners' && { key: 'owner', label: owner, clear: () => setOwner('All owners') },
    phase !== 'All phases' && { key: 'phase', label: phase, clear: () => setPhase('All phases') },
    due !== 'All dates' && { key: 'due', label: due, clear: () => setDue('All dates') },
    query.trim() && { key: 'query', label: `“${query.trim()}”`, clear: () => setQuery('') }
  ].filter(Boolean);
  const clearAll = () => { setTeam('All teams'); setStatus('All statuses'); setPriority('All priorities'); setOwner('All owners'); setPhase('All phases'); setDue('All dates'); setQuery(''); };
  const allSelected = filtered.length > 0 && filtered.every(r => selected.includes(r.id));
  const toggleAll = () => setSelected(allSelected ? selected.filter(id => !filtered.some(r => r.id === id)) : [...new Set([...selected, ...filtered.map(r => r.id)])]);
  const open = reviews.filter(r => statusFor(r) === 'Open').length;
  const dueToday = reviews.filter(r => r.due === today).length;
  const overdue = reviews.filter(r => r.due < today && statusFor(r) !== 'Resolved').length;
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(pageIdx, pages - 1);
  const rows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const from = sorted.length ? safePage * pageSize + 1 : 0;
  const to = Math.min(sorted.length, safePage * pageSize + pageSize);
  const bulkSet = patch => { selected.forEach(id => updateReview(id, patch, Object.keys(patch)[0])); };
  const archiveSelected = () => { selected.forEach(id => updateReview(id, { archived: true })); setSelected([]); };
  const filterClass = active => `filter${active ? ' active' : ''}`;
  return <section className="page reviews-page"><PageHeading title="All Reviews" action={<div className="heading-actions"><button className="secondary-button" onClick={() => downloadReviewsCsv(filtered)}><Download size={16}/> Export CSV</button><button className="primary-button" onClick={() => setModal('review')}><Plus size={17}/> Submit Review</button></div>}/>
    <div className="review-kpis"><MetricCard label="Total Tasks" value={reviews.length}/><MetricCard label="Open" value={open}/><MetricCard label="Assigned to me" value={reviews.filter(r=>r.assignee==='Aria').length}/><MetricCard label="Due today" value={dueToday}/><MetricCard label="Overdue" value={overdue}/></div>
    <div className="toolbar"><label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search title, description, assignee…" aria-label="Search reviews"/></label><AppSelect className={filterClass(team !== 'All teams')} value={team} options={['All teams', ...AREAS]} onChange={setTeam} ariaLabel="Filter by team"/><AppSelect className={filterClass(status !== 'All statuses')} value={status} options={['All statuses', ...STATUS_LIST]} onChange={setStatus} ariaLabel="Filter by status"/><AppSelect className={filterClass(priority !== 'All priorities')} value={priority} options={['All priorities', ...PRIORITIES]} onChange={setPriority} ariaLabel="Filter by priority"/><AppSelect className={filterClass(owner !== 'All owners')} value={owner} options={['All owners', ...teamNames]} onChange={setOwner} ariaLabel="Filter by assignee"/><AppSelect className={filterClass(phase !== 'All phases')} value={phase} options={['All phases', ...STAGES]} onChange={setPhase} ariaLabel="Filter by phase"/><AppSelect className={filterClass(due !== 'All dates')} value={due} options={['All dates', 'Due today', 'Overdue', 'Upcoming', 'No due date']} onChange={setDue} ariaLabel="Filter by due date"/><AppSelect className="filter" value={sort} options={['Newest', 'Oldest', 'Due date', 'Priority', 'Title A–Z']} onChange={setSort} ariaLabel="Sort reviews"/>{chips.length > 0 && <button className="text-button" onClick={clearAll}>Clear filters</button>}</div>
    {chips.length > 0 && <div className="chip-row" aria-label="Active filters">{chips.map(chip => <button key={chip.key} className="chip" onClick={chip.clear} title={`Remove ${chip.label} filter`}>{chip.label}<X size={13}/></button>)}</div>}
    <div className="table-wrap"><table><thead><tr><th><input ref={el => { if (el) el.indeterminate = selected.length > 0 && !allSelected; }} type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all matching reviews" title={`Selects all ${filtered.length} matching reviews across every page`}/></th><th>Title</th><th>Team</th><th>Phase</th><th>Priority</th><th>Assignee</th><th>Status</th><th>Due Date</th><th/></tr></thead><tbody>{rows.map(r => <tr key={r.id} className={`review-row${selected.includes(r.id) ? ' selected' : ''}`} onClick={() => onOpen(r)}><td><input type="checkbox" checked={selected.includes(r.id)} aria-label={`Select ${r.title}`} onClick={e=>e.stopPropagation()} onChange={()=>setSelected(s=>s.includes(r.id)?s.filter(id=>id!==r.id):[...s,r.id])}/></td><td><strong>{r.title}</strong>{r.key ? <small className="row-description">{r.key}</small> : null}{r.description && <small className="row-description">{r.description}</small>}</td><td>{r.area}</td><td onClick={e => e.stopPropagation()}><span className="cell-stack"><AppSelect className="inline" value={r.stage} options={STAGES} onChange={val => updateReview(r.id, { stage: val }, 'stage')} ariaLabel={`Change phase of ${r.title}`}/><InlineSync rowId={r.id} field="stage" sync={sync} onRetry={onRetry}/></span></td><td><Priority value={r.priority}/></td><td onClick={e => e.stopPropagation()}><span className="cell-stack"><span className="assignee"><User size={13}/><AppSelect className="inline" value={r.assignee || ''} options={[{ value: '', label: 'Unassigned' }, ...owners.map(o => ({ value: o, label: o }))]} onChange={val => updateReview(r.id, { assignee: val }, 'assignee')} ariaLabel={`Change assignee of ${r.title}`}/></span><InlineSync rowId={r.id} field="assignee" sync={sync} onRetry={onRetry}/></span></td><td><StatusPill value={statusFor(r)}/></td><td>{r.due ? slashDate(r.due) : '—'}</td><td><button className="row-action" onClick={e=>{e.stopPropagation(); archiveReview(r.id);}} aria-label={`Archive ${r.title}`} title="Archive"><Archive size={16}/></button></td></tr>)}</tbody></table><div className="table-pagination"><span>{selected.length ? `${selected.length} selected` : 'Rows per page'} <b>10 <ChevronDown size={13}/></b></span><span>{from}–{to} of {sorted.length}</span><span className="pagination-arrows"><button className="page-arrow" disabled={safePage===0} onClick={()=>setPageIdx(safePage-1)} aria-label="Previous page"><ChevronLeft size={15}/></button> {safePage + 1} / {pages} <button className="page-arrow" disabled={safePage>=pages-1} onClick={()=>setPageIdx(safePage+1)} aria-label="Next page"><ChevronRight size={15}/></button></span></div></div>
    {selected.length > 0 && <div className="bulk-bar"><strong>{selected.length} selected</strong><AppSelect className="bulk" value="" options={[{ value: '', label: 'Assign…' }, { value: '__unassigned', label: 'Unassigned' }, ...owners.map(o => ({ value: o, label: o }))]} onChange={val => { if (val) bulkSet({ assignee: val === '__unassigned' ? '' : val }); }} ariaLabel="Assign selected"/><AppSelect className="bulk" value="" options={[{ value: '', label: 'Phase…' }, ...STAGES]} onChange={val => { if (val) bulkSet({ stage: val }); }} ariaLabel="Change phase of selected"/><AppSelect className="bulk" value="" options={[{ value: '', label: 'Status…' }, ...STATUS_LIST]} onChange={val => { if (val) bulkSet({ status: val }); }} ariaLabel="Change status of selected"/><button onClick={() => downloadReviewsCsv(reviews.filter(r => selected.includes(r.id)))}><Download size={15}/> Export</button><button onClick={archiveSelected}><Archive size={15}/> Archive</button><button onClick={() => setSelected([])}><X size={15}/> Clear</button></div>}
  </section>;
}
