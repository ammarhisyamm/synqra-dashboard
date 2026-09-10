import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, CircleDot,
  ClipboardList, Download, FileText, KanbanSquare, ListChecks, Menu, MoreHorizontal,
  Plus, Search, Settings2, Sparkles, Target, Trash2, Users, Video, X
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'synqra-dashboard-v1';
const AREAS = ['Design', 'Engineering', 'Marketing'];
const STAGES = ['Planning', 'Review', 'In Progress', 'Final', 'Completed'];
const PRIORITIES = ['Blocker', 'Major', 'Minor'];
const STAGE_ICONS = [ClipboardList, CircleDot, Target, CheckCircle2, Check];

const seed = {
  project: { name: 'Acme Redesign', initials: 'A' },
  reviews: [
    { id: 'r1', title: 'Pricing page copy needs tightening', area: 'Marketing', priority: 'Major', stage: 'Review', assignee: 'Aria', due: '2026-09-12', createdAt: '2026-09-09', archived: false },
    { id: 'r2', title: 'Empty states illustration set', area: 'Design', priority: 'Minor', stage: 'Planning', assignee: 'Mia', due: '2026-09-16', createdAt: '2026-09-09', archived: false },
    { id: 'r3', title: 'Homepage hero lacks clear value proposition', area: 'Marketing', priority: 'Major', stage: 'Planning', assignee: 'Leo', due: '2026-09-14', createdAt: '2026-09-08', archived: false },
    { id: 'r4', title: 'Dark mode contrast fails WCAG AA on cards', area: 'Design', priority: 'Major', stage: 'In Progress', assignee: 'Mia', due: '2026-09-11', createdAt: '2026-09-07', archived: false },
    { id: 'r5', title: 'API rate limiting for public endpoints', area: 'Engineering', priority: 'Minor', stage: 'Review', assignee: 'Leo', due: '2026-09-15', createdAt: '2026-09-06', archived: false },
    { id: 'r6', title: 'Checkout flow drops on mobile Safari', area: 'Engineering', priority: 'Blocker', stage: 'In Progress', assignee: 'Aria', due: '2026-09-09', createdAt: '2026-09-05', archived: false },
    { id: 'r7', title: 'Footer links audit', area: 'Marketing', priority: 'Minor', stage: 'Final', assignee: 'Aria', due: '2026-09-08', createdAt: '2026-09-04', archived: false },
    { id: 'r8', title: 'Analytics events naming', area: 'Engineering', priority: 'Minor', stage: 'Completed', assignee: 'Leo', due: '2026-09-07', createdAt: '2026-09-03', archived: false },
    { id: 'r9', title: 'Onboarding checklist states', area: 'Design', priority: 'Major', stage: 'Final', assignee: 'Mia', due: '2026-09-09', createdAt: '2026-09-02', archived: false }
  ],
  meetings: [
    { id: 'm1', title: 'Weekly product sync', date: '2026-09-09', ai: true, notes: 'Fix onboarding flow. Update the pricing page. Audit dashboard metrics.', itemCount: 3 },
    { id: 'm2', title: 'Design review — checkout', date: '2026-09-06', ai: true, notes: 'Improve checkout mobile layout. Review dark mode contrast.', itemCount: 2 },
    { id: 'm3', title: 'Marketing alignment', date: '2026-09-03', ai: false, notes: 'Clarify hero proposition. Tighten pricing page copy.', itemCount: 2 }
  ]
};

function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || seed; } catch { return seed; }
}

function dateLabel(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
}
function relativeDate(date) {
  const dateValue = new Date(date.length === 10 ? `${date}T12:00:00` : date);
  const d = Math.max(0, Math.floor((Date.now() - dateValue.getTime()) / 86400000));
  return d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`;
}
function toKey(title) { return title.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not save your changes.');
  return body;
}

function App() {
  const [data, setData] = useState(loadData);
  const [cloudReady, setCloudReady] = useState(false);
  const [page, setPage] = useState('Dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data]);
  useEffect(() => {
    api('/api/bootstrap').then(remote => { setData(remote); setCloudReady(true); }).catch(() => setCloudReady(false));
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const activeReviews = useMemo(() => data.reviews.filter(r => !r.archived), [data.reviews]);
  const updateReview = (id, patch) => {
    setData(prev => ({ ...prev, reviews: prev.reviews.map(r => r.id === id ? { ...r, ...patch } : r) }));
    api(`/api/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(error => setToast(error.message));
  };
  const addReview = (review) => {
    const saved = { id: crypto.randomUUID(), createdAt: new Date().toISOString().slice(0, 10), archived: false, ...review };
    setData(prev => ({ ...prev, reviews: [saved, ...prev.reviews] }));
    api('/api/reviews', { method: 'POST', body: JSON.stringify(saved) }).catch(error => setToast(error.message));
  };
  const archiveReview = (id) => { updateReview(id, { archived: true }); setToast('Review archived'); };
  const restoreReview = (id) => { updateReview(id, { archived: false }); setToast('Review restored'); };
  const addMeeting = (meeting) => {
    const saved = { id: crypto.randomUUID(), itemCount: 0, ...meeting };
    setData(prev => ({ ...prev, meetings: [saved, ...prev.meetings] }));
    api('/api/meetings', { method: 'POST', body: JSON.stringify(saved) }).catch(error => setToast(error.message));
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'synqra-export.json'; a.click(); URL.revokeObjectURL(url);
    setToast('Project data exported');
  };
  const resetData = () => { setData(seed); setToast('Demo data restored'); };

  return <div className="app-shell">
    <Sidebar page={page} setPage={setPage} project={data.project} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
    <main className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu size={20}/></button>
        <div className="topbar-actions">
          <button className="text-button" onClick={exportData}><Download size={16}/> Export</button>
          <button className="primary-button" onClick={() => setModal('review')}><Plus size={17}/> New review</button>
        </div>
      </header>
      {page === 'Dashboard' && <Dashboard reviews={activeReviews} meetings={data.meetings} goTo={setPage} />}
      {page === 'All Reviews' && <Reviews reviews={activeReviews} query={query} setQuery={setQuery} updateReview={updateReview} archiveReview={archiveReview} setModal={setModal} />}
      {page === 'Meetings' && <Meetings meetings={data.meetings} addMeeting={addMeeting} addReview={addReview} setToast={setToast} setModal={setModal} />}
      {page === 'Kanban' && <Kanban reviews={activeReviews} updateReview={updateReview} archiveReview={archiveReview} setModal={setModal} />}
      {page === 'Archive' && <ArchivePage reviews={data.reviews.filter(r => r.archived)} restoreReview={restoreReview} />}
    </main>
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
    {modal === 'review' && <ReviewModal onClose={() => setModal(null)} onSave={(review) => { addReview(review); setModal(null); setToast('Review created'); }} />}
    {modal === 'meeting' && <MeetingModal onClose={() => setModal(null)} onSave={(meeting) => { addMeeting(meeting); setModal(null); setToast('Meeting saved'); }} />}
    <footer className="app-footer"><button onClick={resetData}>Restore demo data</button><span>{cloudReady ? 'Synced with Cloudflare D1' : 'Local draft — reconnecting to Cloudflare'}</span></footer>
  </div>;
}

function Sidebar({ page, setPage, project, menuOpen, setMenuOpen }) {
  const items = [["Dashboard", ClipboardList], ["All Reviews", ListChecks], ["Meetings", CalendarDays], ["Kanban", KanbanSquare], ["Archive", Archive]];
  return <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
    <div className="brand"><span className="brand-mark">🎯</span><strong>{project.name}</strong><ChevronDown size={15}/></div>
    <nav>{items.map(([name, Icon]) => <button key={name} className={page === name ? 'active' : ''} onClick={() => { setPage(name); setMenuOpen(false); }}><Icon size={17}/>{name}</button>)}</nav>
    <div className="sidebar-bottom"><div className="team-row"><div className="avatar avatar-dark">A</div><span>Aria Nilsson</span><MoreHorizontal size={16}/></div><button className="settings"><Settings2 size={16}/> Settings</button></div>
  </aside>;
}

function Dashboard({ reviews, meetings, goTo }) {
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const today = new Date().toISOString().slice(0, 10);
  const needsAttention = reviews.filter(r => r.priority === 'Blocker' || r.due < today).slice(0, 3);
  const completed = reviews.filter(r => r.stage === 'Completed').length;
  const blockers = reviews.filter(r => r.priority === 'Blocker').length;
  return <section className="page dashboard-page">
    <div className="page-title"><div><h1>Dashboard</h1><p>{day}</p></div><span className="readonly"><CircleDot size={14}/> Live workspace</span></div>
    <div className="dashboard-grid">
      <div className="dashboard-main">
        <SectionHead title="Needs attention" action={() => goTo('All Reviews')} />
        <div className="attention-list">{needsAttention.length ? needsAttention.map(r => <AttentionCard key={r.id} review={r}/>) : <Empty text="Nothing needs attention right now."/>}</div>
        <SectionHead title="Active stages" aside={`${STAGES.length} stages`} />
        <div className="stage-grid">{STAGES.map((stage, index) => {
          const items = reviews.filter(r => r.stage === stage); const done = stage === 'Completed' || stage === 'Final'; const blocked = items.some(r => r.priority === 'Blocker'); const Icon = STAGE_ICONS[index];
          return <article className="stage-card" key={stage}><div className="card-meta"><Icon size={17}/><StatusPill value={blocked ? 'Blocked' : done ? 'Complete' : 'In progress'} /></div><h3>{stage}</h3><div className="progress-row"><div className="progress"><span style={{ width: `${Math.min(100, items.length * 34)}%` }}/></div><small>{items.length}/{Math.max(items.length, stage === 'Planning' ? 2 : stage === 'Review' ? 3 : 1)}</small></div></article>;
        })}</div>
        <SectionHead title="Recent activity" action={() => goTo('All Reviews')} />
        <div className="activity-panel">{reviews.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(r => <div className="activity-row" key={r.id}><span className={`dot ${r.priority.toLowerCase()}`}/><div><strong>{r.title}</strong><p>{r.area} · {r.stage}</p></div><time>{relativeDate(r.createdAt)}</time></div>)}</div>
      </div>
      <div className="dashboard-rail"><MeetingRail meetings={meetings} goTo={goTo}/><Summary reviews={reviews} completed={completed} blockers={blockers}/></div>
    </div>
  </section>;
}

function SectionHead({ title, action, aside }) { return <div className="section-head"><h2>{title}</h2>{action ? <button onClick={action}>View all <ArrowRight size={15}/></button> : <span>{aside}</span>}</div>; }
function AttentionCard({ review }) { return <article className="attention-card"><span className={`dot ${review.priority.toLowerCase()}`}/><div><strong>{review.title}</strong><p>{review.priority} · {review.stage} · Due {dateLabel(review.due)}</p></div></article>; }
function StatusPill({ value }) { return <span className={`status-pill ${value.toLowerCase().replace(' ', '-')}`}>{value}</span>; }
function Empty({ text }) { return <div className="empty-state">{text}</div>; }
function MeetingRail({ meetings, goTo }) { return <aside className="rail-card"><div className="rail-head"><h2>Recent meetings</h2><CalendarDays size={18}/></div>{meetings.slice(0,3).map(m => <button className="meeting-row" key={m.id} onClick={() => goTo('Meetings')}><span className="meeting-icon"><Video size={16}/></span><span><strong>{m.title}</strong><small>{dateLabel(m.date)} <b>⌘ {m.itemCount}</b>{m.ai && <em>· AI</em>}</small></span></button>)}</aside>; }
function Summary({ reviews, completed, blockers }) { return <aside className="rail-card summary"><h2>Summary</h2><p>Project overview</p><div className="summary-list"><Metric label="Total reviews" value={reviews.length}/><Metric label="Resolved" value={completed}/><Metric label="Blockers" value={blockers}/><Metric label="Open items" value={reviews.length - completed}/><Metric label="Areas" value={new Set(reviews.map(r => r.area)).size}/></div><div className="summary-alert">{blockers} blocker · {reviews.filter(r => r.due < new Date().toISOString().slice(0,10)).length} overdue need attention.</div></aside>; }
function Metric({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function Reviews({ reviews, query, setQuery, updateReview, archiveReview, setModal }) {
  const [area, setArea] = useState('All areas');
  const filtered = reviews.filter(r => (area === 'All areas' || r.area === area) && r.title.toLowerCase().includes(query.toLowerCase()));
  return <section className="page"><PageHeading eyebrow="PROJECT TRACKER" title="All reviews" description="Every item raised in your project, in one place." action={<button className="primary-button" onClick={() => setModal('review')}><Plus size={17}/> New review</button>}/>
    <div className="toolbar"><label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search reviews"/></label><select value={area} onChange={e => setArea(e.target.value)}><option>All areas</option>{AREAS.map(a=><option key={a}>{a}</option>)}</select><span>{filtered.length} reviews</span></div>
    <div className="table-wrap"><table><thead><tr><th>Review item</th><th>Area</th><th>Priority</th><th>Stage</th><th>Assignee</th><th>Due</th><th/></tr></thead><tbody>{filtered.map(r => <tr key={r.id}><td><strong>{r.title}</strong></td><td><span className="area-tag">{r.area}</span></td><td><Priority value={r.priority}/></td><td><select className="inline-select" value={r.stage} onChange={e=>updateReview(r.id,{stage:e.target.value})}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></td><td><span className="assignee"><i>{r.assignee[0]}</i>{r.assignee}</span></td><td>{dateLabel(r.due)}</td><td><button className="row-action" onClick={()=>archiveReview(r.id)} aria-label="Archive review"><Archive size={16}/></button></td></tr>)}</tbody></table></div>
  </section>;
}
function Priority({ value }) { return <span className={`priority ${value.toLowerCase()}`}><i/>{value}</span>; }
function PageHeading({ eyebrow, title, description, action }) { return <div className="page-heading"><div>{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }

function Meetings({ meetings, addMeeting, addReview, setToast, setModal }) {
  const [selected, setSelected] = useState(meetings[0]?.id);
  const meeting = meetings.find(m => m.id === selected) || meetings[0];
  const [drafts, setDrafts] = useState([]);
  useEffect(() => setDrafts(meeting ? extractNotes(meeting.notes) : []), [meeting?.id]);
  const createDrafts = () => { drafts.forEach((title, i) => addReview({ title, area: AREAS[i % AREAS.length], priority: i === 0 ? 'Major' : 'Minor', stage: 'Planning', assignee: ['Aria','Leo','Mia'][i % 3], due: '2026-09-18' })); setToast(`${drafts.length} review items created`); };
  return <section className="page meetings-page"><PageHeading eyebrow="MEETING INTELLIGENCE" title="Meetings" description="Capture the discussion, then turn decisions into owned work." action={<button className="primary-button" onClick={() => setModal('meeting')}><Plus size={17}/> New meeting</button>}/>
    <div className="meetings-layout"><aside className="meeting-list"><div className="list-label">RECENT MEETINGS</div>{meetings.map(m => <button key={m.id} onClick={()=>setSelected(m.id)} className={m.id===meeting?.id?'selected':''}><span className="meeting-icon"><Video size={16}/></span><span><strong>{m.title}</strong><small>{dateLabel(m.date)} · {m.itemCount} items {m.ai && '· AI'}</small></span></button>)}</aside>
      {meeting && <div className="meeting-detail"><div className="meeting-detail-head"><div><span className="eyebrow">{dateLabel(meeting.date)}</span><h2>{meeting.title}</h2></div><StatusPill value={meeting.ai ? 'AI ready' : 'Notes only'}/></div><div className="notes-box"><div><FileText size={17}/><strong>Meeting notes</strong></div><textarea defaultValue={meeting.notes} onChange={e => { meeting.notes=e.target.value; }} placeholder="Write notes, one action per line…"/></div><div className="extraction-head"><div><span className="sparkle"><Sparkles size={16}/></span><div><h3>Suggested review items</h3><p>Generated from the notes — edit before adding.</p></div></div><button className="primary-button" disabled={!drafts.length} onClick={createDrafts}>Add {drafts.length} to board <ArrowRight size={16}/></button></div><div className="draft-list">{drafts.length ? drafts.map((d,i)=><div key={`${d}-${i}`}><CheckCircle2 size={18}/><input value={d} onChange={e=>setDrafts(a=>a.map((x,n)=>n===i?e.target.value:x))}/><button onClick={()=>setDrafts(a=>a.filter((_,n)=>n!==i))}><X size={16}/></button></div>) : <Empty text="Add clear action items to your notes to generate drafts."/>}</div></div>}
    </div></section>;
}
function extractNotes(notes) { return notes.split(/[\n.]+/).map(s=>s.replace(/^\s*(?:[-•*]\s*)?/, '').trim()).filter(s=>s.length>4).slice(0,6); }

function Kanban({ reviews, updateReview, archiveReview, setModal }) { return <section className="page"><PageHeading eyebrow="PROJECT FLOW" title="Kanban" description="Move work through the stages and keep progress visible." action={<button className="primary-button" onClick={() => setModal('review')}><Plus size={17}/> New review</button>}/><div className="board">{STAGES.map(stage => <div className="board-column" key={stage}><div className="board-column-head"><h3>{stage}</h3><span>{reviews.filter(r=>r.stage===stage).length}</span></div>{reviews.filter(r=>r.stage===stage).map(r=><article className="kanban-card" key={r.id}><div className="kanban-card-head"><Priority value={r.priority}/><button onClick={()=>archiveReview(r.id)}><Archive size={14}/></button></div><h4>{r.title}</h4><p>{r.area}</p><div className="kanban-footer"><span className="assignee"><i>{r.assignee[0]}</i>{r.assignee}</span><select value={r.stage} onChange={e=>updateReview(r.id,{stage:e.target.value})} aria-label="Move card">{STAGES.map(s=><option key={s}>{s}</option>)}</select></div></article>)}<button className="add-card" onClick={()=>setModal('review')}><Plus size={15}/> Add item</button></div>)}</div></section>; }

function ArchivePage({ reviews, restoreReview }) { return <section className="page"><PageHeading eyebrow="PROJECT TRACKER" title="Archive" description="Resolved or paused items stay here without disappearing."/>{reviews.length ? <div className="archive-list">{reviews.map(r=><article key={r.id}><div><Priority value={r.priority}/><h3>{r.title}</h3><p>{r.area} · Archived item</p></div><button className="text-button" onClick={()=>restoreReview(r.id)}>Restore <ArrowRight size={15}/></button></article>)}</div> : <Empty text="Your archive is empty."/>}</section>; }

function ReviewModal({ onClose, onSave }) { const [form, setForm] = useState({title:'',area:'Design',priority:'Major',stage:'Planning',assignee:'Aria',due:'2026-09-18'}); const edit = (key,val)=>setForm(x=>({...x,[key]:val})); return <Modal title="New review item" subtitle="Create an actionable item for your team." onClose={onClose}><form onSubmit={e=>{e.preventDefault(); if(form.title.trim())onSave(form)}}><label>Review item<input autoFocus value={form.title} onChange={e=>edit('title',e.target.value)} placeholder="What needs to happen?" required/></label><div className="form-grid"><SelectField label="Area" value={form.area} values={AREAS} onChange={v=>edit('area',v)}/><SelectField label="Priority" value={form.priority} values={PRIORITIES} onChange={v=>edit('priority',v)}/><SelectField label="Stage" value={form.stage} values={STAGES} onChange={v=>edit('stage',v)}/><SelectField label="Assignee" value={form.assignee} values={['Aria','Leo','Mia']} onChange={v=>edit('assignee',v)}/></div><label>Due date<input type="date" value={form.due} onChange={e=>edit('due',e.target.value)}/></label><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button">Create review <ArrowRight size={16}/></button></div></form></Modal>; }
function MeetingModal({ onClose, onSave }) { const [form,setForm]=useState({title:'',date:'2026-09-10',notes:'',ai:true}); const edit=(k,v)=>setForm(x=>({...x,[k]:v})); return <Modal title="New meeting" subtitle="Notes are saved to this project and can generate review items." onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(form.title.trim())onSave(form)}}><label>Meeting title<input autoFocus value={form.title} onChange={e=>edit('title',e.target.value)} placeholder="e.g. Design review" required/></label><label>Date<input type="date" value={form.date} onChange={e=>edit('date',e.target.value)}/></label><label>Notes<textarea value={form.notes} onChange={e=>edit('notes',e.target.value)} placeholder="One decision or action per line" rows="6"/></label><label className="switch-label"><input type="checkbox" checked={form.ai} onChange={e=>edit('ai',e.target.checked)}/><span>Prepare AI review suggestions</span></label><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button">Save meeting <ArrowRight size={16}/></button></div></form></Modal>; }
function SelectField({ label,value,values,onChange }) { return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)}>{values.map(v=><option key={v}>{v}</option>)}</select></label>; }
function Modal({title,subtitle,onClose,children}) { return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={19}/></button><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>; }

createRoot(document.getElementById('root')).render(<App/>);
