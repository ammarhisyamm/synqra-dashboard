import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive, ArrowRight, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronsUpDown, CircleDot,
  ClipboardList, Download, FileText, Folder, Home, Info, KanbanSquare, LayoutGrid, ListChecks,
  Menu, MessageCircle, MoreHorizontal, MoreVertical, Plus, Search, Settings, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  Table2, Target, Users, Video, X, Clock3, Trash2, ExternalLink
} from 'lucide-react';
import './styles.css';
import './detail.css';
import './detail-overrides.css';
import './detail.css';

const STORAGE_KEY = 'synqra-dashboard-v1';
const AREAS = ['Design', 'Engineering', 'Marketing'];
const STAGES = ['Planning', 'Review', 'In Progress', 'Final', 'Completed'];
const PRIORITIES = ['Blocker', 'Major', 'Minor'];
const STAGE_ICONS = [ClipboardList, CircleDot, Target, CheckCircle2, Check];
const PROJECTS = ['Omnichannel', 'Kaizen Project', 'Billing Portal', 'Onboarding Revamp', 'Test ER'];

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
function statusFor(review) {
  if (review.status) return review.status;
  if (review.stage === 'Completed') return 'Resolved';
  if (review.stage === 'Final') return 'Review';
  if (review.stage === 'In Progress') return 'In Progress';
  return 'Open';
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not save your changes.');
  return body;
}

function App() {
  const [data, setData] = useState(loadData);
  const [cloudReady, setCloudReady] = useState(false);
  const [user, setUser] = useState(undefined);
  const [page, setPage] = useState('Overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [selectedReview, setSelectedReview] = useState(null);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data]);
  useEffect(() => {
    api('/api/auth/me').then(({ user: signedInUser }) => {
      setUser(signedInUser);
      return api('/api/bootstrap');
    }).then(remote => { setData(remote); setCloudReady(true); }).catch(() => { setUser(null); setCloudReady(false); });
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
  const signOut = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } finally { setUser(null); setCloudReady(false); setData(seed); } };

  if (user === undefined) return <AuthLoading/>;
  if (!user) return <AuthScreen onAuthenticated={signedInUser => { setUser(signedInUser); api('/api/bootstrap').then(remote => { setData(remote); setCloudReady(true); }).catch(() => setCloudReady(false)); }}/>;

  return <div className="app-shell">
    <Sidebar page={page} setPage={setPage} menuOpen={menuOpen} setMenuOpen={setMenuOpen} user={user} onSignOut={signOut} project={data.project} onProjectClick={() => setProjectOpen(!projectOpen)} />
    <main className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu size={20}/></button>
        <label className="global-search"><Search size={17}/><input placeholder="Search…"/><kbd>⌘K</kbd></label>
        <div className="topbar-actions">
          <button className="collaborator"><Users size={16}/> Collaborator</button>
          <button className="notification" aria-label="Notifications"><Bell size={17}/><i/></button>
        </div>
      </header>
      {projectOpen && <ProjectSwitcher project={data.project} onClose={() => setProjectOpen(false)} />}
      {page === 'Overview' && <Dashboard reviews={activeReviews} meetings={data.meetings} goTo={setPage} onSubmitReview={() => setModal('review')} onNewMeeting={() => setModal('meeting')} />}
      {page === 'All Reviews' && <Reviews reviews={activeReviews} query={query} setQuery={setQuery} updateReview={updateReview} archiveReview={archiveReview} setModal={setModal} onOpen={setSelectedReview} />}
      {page === 'Meetings' && <Meetings meetings={data.meetings} addMeeting={addMeeting} addReview={addReview} setToast={setToast} setModal={setModal} />}
      {page === 'Kanban Board' && <Kanban reviews={activeReviews} updateReview={updateReview} archiveReview={archiveReview} setModal={setModal} />}
      {page === 'Archive' && <ArchivePage reviews={data.reviews.filter(r => r.archived)} restoreReview={restoreReview} />}
      {page === 'Settings' && <SettingsPage project={data.project} setToast={setToast} />}
      {page === 'Admin' && <AdminPage user={user}/>} 
    </main>
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
    {modal === 'review' && <ReviewModal onClose={() => setModal(null)} onSave={(review) => { addReview(review); setModal(null); setToast('Review created'); }} />}
    {modal === 'meeting' && <MeetingModal onClose={() => setModal(null)} onSave={(meeting) => { addMeeting(meeting); setModal(null); setToast('Meeting saved'); }} />}
    {selectedReview && <ReviewDetail review={selectedReview} meetings={data.meetings} user={user} onClose={() => setSelectedReview(null)} onUpdated={saved => { setData(prev => ({...prev, reviews: prev.reviews.map(r => r.id === saved.id ? {...r, ...saved} : r)})); setSelectedReview(saved); }} onDeleted={id => { setData(prev => ({...prev, reviews: prev.reviews.filter(r => r.id !== id)})); setSelectedReview(null); setToast('Task deleted'); }} onToast={setToast} />}
    <footer className="app-footer"><button onClick={resetData}>Restore demo data</button><span>{cloudReady ? 'Synced with Cloudflare D1' : 'Local draft — reconnecting to Cloudflare'}</span></footer>
  </div>;
}

function Sidebar({ page, setPage, menuOpen, setMenuOpen, user, onSignOut, project, onProjectClick }) {
  const workspace = [["Overview", Home], ["All Reviews", MessageCircle], ["Meetings", CalendarDays], ["Kanban Board", KanbanSquare], ["Archive", Archive]];
  const go = name => { setPage(name); setMenuOpen(false); };
  return <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
    <div className="sidebar-head">
      <button className="sidebar-menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu size={22}/></button>
      <div className="sidebar-brand"><SynqraMark/><div><strong>Synqra</strong><small>Powered by MULIA</small></div></div>
    </div>
    <div className="sidebar-scroll">
      <section><p className="side-label">PROJECT</p><button className="project-select" onClick={onProjectClick}><Folder size={20}/><span>{project.name}</span><ChevronsUpDown size={17}/></button></section>
      <section><p className="side-label">WORKSPACE</p><nav className="side-nav">{workspace.map(([name, Icon]) => <button key={name} className={page === name ? 'active' : ''} onClick={() => go(name)}><Icon size={20} {...(name === 'Overview' && page === name ? { fill: 'currentColor' } : {})}/><span>{name}</span></button>)}</nav></section>
    </div>
    <div className="sidebar-foot">
      <p className="side-label">MANAGEMENT</p>
      <nav className="side-nav">
        <button className={page === 'Settings' ? 'active' : ''} onClick={() => go('Settings')}><Settings size={20}/><span>Settings</span></button>
        {['super_admin','admin'].includes(user.role) && <button className={page === 'Admin' ? 'active' : ''} onClick={() => go('Admin')}><ShieldCheck size={20}/><span>Admin Management</span></button>}
      </nav>
      <button className="user-card" onClick={onSignOut} title="Sign out"><div className="avatar avatar-dark">{user.name.slice(0,2).toUpperCase()}</div><div><strong>{user.name}</strong><small>{user.email}</small></div><MoreVertical size={18}/></button>
    </div>
  </aside>;
}

function SynqraMark() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5 28.5 9.7v12.6L16 29.5 3.5 22.3V9.7Z" fill="none" stroke="#10182b" strokeWidth="3" strokeLinejoin="round"/><path d="M16 10.2l5.8 3.3v6.7l-5.8 3.3-5.8-3.3v-6.7Z" fill="#10182b"/></svg>;
}

function AuthLoading() { return <div className="auth-shell"><div className="auth-card auth-loading"><span className="brand-symbol"><span/></span><strong>Checking your session…</strong></div></div>; }
function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); const [form, setForm] = useState({ name:'', email:'', password:'' }); const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const submit = async event => { event.preventDefault(); setPending(true); setError(''); try { const result = await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { method:'POST', body:JSON.stringify(form) }); onAuthenticated(result.user); } catch (err) { setError(err.message); } finally { setPending(false); } };
  return <div className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-symbol"><span/></span><div><strong>Synqra</strong><small>Powered by MULIA</small></div></div><h1>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1><p>{mode === 'login' ? 'Sign in to continue to your project reviews.' : 'Your first account becomes the workspace super admin.'}</p><form onSubmit={submit}>{mode === 'register' && <label>Name<input value={form.name} onChange={e=>update('name',e.target.value)} autoComplete="name" required/></label>}<label>Email<input type="email" value={form.email} onChange={e=>update('email',e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={form.password} onChange={e=>update('password',e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="10" required/><small>At least 10 characters.</small></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button" disabled={pending}>{pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16}/></button></form><button className="auth-toggle" onClick={()=>{setMode(mode === 'login' ? 'register' : 'login');setError('');}}>{mode === 'login' ? 'New to Synqra? Create an account' : 'Already have an account? Sign in'}</button></section></div>;
}

function ProjectSwitcher({ project, onClose }) {
  return <div className="project-switcher"><div className="switcher-title">PROJECT</div><button className="current-project"><Folder size={22}/><span>{project.name}</span><ChevronDown size={17}/></button><label className="project-search"><Search size={19}/><input placeholder="Search projects"/></label><div className="project-list">{PROJECTS.map((name, index) => <button key={name} className={index === 0 ? 'selected' : ''}><Folder size={19}/><span>{name}</span>{index === 0 && <Check size={20}/>}</button>)}</div><button className="new-project"><Plus size={21}/> New project</button><button className="switcher-close" onClick={onClose}><X size={17}/></button></div>;
}

function Dashboard({ reviews, meetings, goTo, onSubmitReview, onNewMeeting }) {
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const today = new Date().toISOString().slice(0, 10);
  const needsAttention = reviews.filter(r => r.priority === 'Blocker' || r.due < today).slice(0, 4);
  const completed = reviews.filter(r => r.stage === 'Completed').length;
  const blockers = reviews.filter(r => r.priority === 'Blocker').length;
  const overdue = reviews.filter(r => r.due < today && r.stage !== 'Completed').length;
  return <section className="page dashboard-page">
    <div className="page-title"><div><h1>Overview</h1><p>{day}</p></div><button className="primary-button" onClick={onSubmitReview}><Plus size={16}/> Submit Review</button></div>
    <div className="dashboard-grid">
      <div className="dashboard-main">
        <SectionHead title="Needs attention" action={() => goTo('All Reviews')} />
        <div className="attention-list">{needsAttention.length ? needsAttention.map(r => <AttentionCard key={r.id} review={r} today={today} onReview={() => goTo('All Reviews')}/>) : <Empty text="Nothing needs attention right now."/>}</div>
        <SectionHead title="Active stages" aside="5 stages" />
        <div className="stage-grid">{STAGES.map((stage, index) => {
          const items = reviews.filter(r => r.stage === stage);
          const done = items.filter(r => r.stage === 'Completed' || r.stage === 'Final').length;
          const blocked = items.some(r => r.priority === 'Blocker');
          const Icon = STAGE_ICONS[index];
          return <article className="stage-card" key={stage}><div className="card-meta"><Icon size={18}/><StatusPill value={blocked ? 'Blocked' : stage === 'Completed' || stage === 'Final' ? 'Complete' : 'In progress'} /></div><h3>{stage}</h3><div className="progress-row"><div className="progress"><span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}/></div><small>{done}/{items.length}</small></div></article>;
        })}</div>
        <SectionHead title="Recent activity" action={() => goTo('All Reviews')} />
        <div className="activity-panel">{reviews.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(r => <div className="activity-row" key={r.id}><span className={`dot ${r.priority.toLowerCase()}`}/><div><strong>{r.title}</strong><p>{r.area} · {r.stage}</p></div><time>{relativeDate(r.createdAt)}</time></div>)}</div>
      </div>
      <div className="dashboard-rail"><MeetingRail meetings={meetings} goTo={goTo} onNew={onNewMeeting}/><Summary reviews={reviews} completed={completed} blockers={blockers} overdue={overdue}/></div>
    </div>
  </section>;
}

function SectionHead({ title, action, aside }) { return <div className="section-head"><h2>{title}</h2>{action ? <button onClick={action}>View all <ArrowRight size={15}/></button> : <span>{aside}</span>}</div>; }
function AttentionCard({ review, today, onReview }) {
  const meta = `${review.due < today ? 'Overdue' : review.priority} · ${review.stage} · Due ${dateLabel(review.due)}`;
  return <article className="attention-card"><div className="attention-top"><span className={`dot ${review.priority.toLowerCase()}`}/><div><strong>{review.title}</strong><p>{meta}</p></div></div><button className="review-btn" onClick={onReview}>Review</button></article>;
}
function StatusPill({ value }) { return <span className={`status-pill ${value.toLowerCase().replace(' ', '-')}`}>{value}</span>; }
function Empty({ text }) { return <div className="empty-state">{text}</div>; }
function MeetingRail({ meetings, goTo, onNew }) { return <aside className="rail-card"><div className="rail-head"><h2>Meetings</h2><button className="new-btn" onClick={onNew}><Plus size={14}/> New</button></div>{meetings.slice(0, 4).map(m => <button className="meeting-row" key={m.id} onClick={() => goTo('Meetings')}><span className="meeting-icon"><CalendarDays size={16}/></span><span><strong>{m.title}</strong><small>{dateLabel(m.date)}</small></span>{m.ai && <Sparkles size={15} className="meeting-ai"/>}</button>)}<button className="view-all" onClick={() => goTo('Meetings')}>View all <ArrowRight size={14}/></button></aside>; }
function Summary({ reviews, completed, blockers, overdue }) { return <aside className="rail-card summary"><h2>Summary</h2><p>Project overview</p><div className="summary-list"><Metric label="Total reviews" value={reviews.length}/><Metric label="Resolved" value={completed}/><Metric label="Blockers" value={blockers}/><Metric label="Open items" value={reviews.length - completed}/><Metric label="Areas" value={new Set(reviews.map(r => r.area)).size}/></div><div className="summary-alert"><Info size={15}/><span>{blockers ? `${blockers} blocker · ` : ''}{overdue} overdue need attention.</span></div></aside>; }
function Metric({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function Reviews({ reviews, query, setQuery, updateReview, archiveReview, setModal, onOpen }) {
  const [area, setArea] = useState('All teams'); const [status, setStatus] = useState('All statuses'); const [priority, setPriority] = useState('All priorities'); const [selected, setSelected] = useState([]);
  const filtered = reviews.filter(r => (area === 'All teams' || r.area === area) && (status === 'All statuses' || statusFor(r) === status) && (priority === 'All priorities' || r.priority === priority) && `${r.title} ${r.description || ''} ${r.assignee || ''}`.toLowerCase().includes(query.toLowerCase()));
  const allSelected = filtered.length > 0 && filtered.every(r => selected.includes(r.id));
  const toggleAll = () => setSelected(allSelected ? selected.filter(id => !filtered.some(r => r.id === id)) : [...new Set([...selected, ...filtered.map(r => r.id)])]);
  const open = reviews.filter(r => statusFor(r) === 'Open').length;
  const dueToday = reviews.filter(r => r.due === new Date().toISOString().slice(0, 10)).length;
  const overdue = reviews.filter(r => r.due < new Date().toISOString().slice(0, 10) && statusFor(r) !== 'Resolved').length;
  return <section className="page reviews-page"><PageHeading title="All Reviews" action={<button className="primary-button" onClick={() => setModal('review')}><Plus size={17}/> Submit Review</button>}/>
    <div className="review-kpis"><MetricCard label="Total Tasks" value={reviews.length}/><MetricCard label="Open" value={open}/><MetricCard label="Assigned to me" value={reviews.filter(r=>r.assignee==='Aria').length}/><MetricCard label="Due today" value={dueToday}/><MetricCard label="Overdue" value={overdue}/></div>
    <div className="toolbar"><label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search title, description, assignee…"/></label><select value={area} onChange={e => setArea(e.target.value)}><option>All teams</option>{AREAS.map(a=><option key={a}>{a}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option><option>Open</option><option>In Progress</option><option>Review</option><option>Resolved</option><option>Rejected</option></select><select value={priority} onChange={e=>setPriority(e.target.value)}><option>All priorities</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select><button className="filter-more"><SlidersHorizontal size={15}/> More</button><div className="view-switch"><Table2 size={16}/><LayoutGrid size={16}/><MoreHorizontal size={18}/></div></div>
    <div className="table-wrap"><table><thead><tr><th><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all"/></th><th>Title</th><th>Team</th><th>Phase</th><th>Priority</th><th>Assignee</th><th>Status</th><th>Due Date</th><th/></tr></thead><tbody>{filtered.map(r => <tr key={r.id} className="review-row" onClick={() => onOpen(r)}><td><input type="checkbox" checked={selected.includes(r.id)} aria-label={`Select ${r.title}`} onClick={e=>e.stopPropagation()} onChange={()=>setSelected(s=>s.includes(r.id)?s.filter(id=>id!==r.id):[...s,r.id])}/></td><td><strong>{r.title}</strong>{r.description && <small className="row-description">{r.description}</small>}</td><td>{r.area}</td><td><select className="inline-select" value={r.stage} onClick={e=>e.stopPropagation()} onChange={e=>updateReview(r.id,{stage:e.target.value})}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></td><td><Priority value={r.priority}/></td><td><span className="assignee"><i>{(r.assignee || '?')[0]}</i>{r.assignee || 'Unassigned'}</span></td><td><StatusPill value={statusFor(r)}/></td><td>{r.due ? dateLabel(r.due) : '—'}</td><td><button className="row-action" onClick={e=>{e.stopPropagation(); archiveReview(r.id)}} aria-label="Archive review"><Archive size={16}/></button></td></tr>)}</tbody></table><div className="table-pagination"><span>{selected.length ? `${selected.length} selected` : 'Rows per page'} <b>10 <ChevronDown size={13}/></b></span><span>1–{Math.min(10, filtered.length)} of {filtered.length}</span><span className="pagination-arrows">‹　1 / {Math.max(1, Math.ceil(filtered.length / 10))}　›</span></div></div>
  </section>;
}
function ReviewDetail({ review, meetings, user, onClose, onUpdated, onDeleted, onToast }) {
  const [detail,setDetail]=useState(null); const [comment,setComment]=useState(''); const [draft,setDraft]=useState(review);
  useEffect(()=>{api(`/api/reviews/${review.id}/details`).then(d=>{setDetail(d);setDraft(d.review)}).catch(e=>onToast(e.message))},[review.id]);
  const save=async patch=>{try{const saved=await api(`/api/reviews/${review.id}`,{method:'PATCH',body:JSON.stringify(patch)});setDraft(saved);setDetail(d=>({...d,review:saved}));onUpdated(saved);onToast('Task updated')}catch(e){onToast(e.message)}};
  const submitComment=async e=>{e.preventDefault();if(!comment.trim())return;try{const c=await api(`/api/reviews/${review.id}/comments`,{method:'POST',body:JSON.stringify({body:comment})});setDetail(d=>({...d,comments:[...(d.comments||[]),c]}));setComment('');onToast('Comment added')}catch(e){onToast(e.message)}};
  const remove=async()=>{if(!confirm('Delete this task permanently?'))return;try{await api(`/api/reviews/${review.id}`,{method:'DELETE'});onDeleted(review.id)}catch(e){onToast(e.message)}};
  return <div className="detail-backdrop" onMouseDown={onClose}><aside className="detail-panel" onMouseDown={e=>e.stopPropagation()}><button className="detail-close" onClick={onClose}><X size={19}/></button><div className="detail-head"><h2>{draft.title}</h2><div className="detail-badges"><StatusPill value={statusFor(draft)}/><Priority value={draft.priority}/><span>{draft.due||'No due date'}</span></div></div><div className="detail-scroll"><DetailSection title="Description"><textarea className="detail-description" value={draft.description||''} onChange={e=>setDraft({...draft,description:e.target.value})} onBlur={e=>save({description:e.target.value})} placeholder="Add a description…"/></DetailSection><DetailSection title="Related meeting">{detail?.meeting?<div className="related-meeting"><Video size={17}/><div><strong>{detail.meeting.title}</strong><small>{dateLabel(detail.meeting.date)}</small></div><ExternalLink size={15}/></div>:<select value={draft.meetingId||''} onChange={e=>save({meetingId:e.target.value})}><option value="">No related meeting</option>{meetings.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select>}</DetailSection><DetailSection title="Properties"><div className="detail-grid"><SelectField label="Phase" value={draft.stage} values={STAGES} onChange={v=>save({stage:v})}/><SelectField label="Team" value={draft.area} values={AREAS} onChange={v=>save({area:v})}/><SelectField label="Status" value={statusFor(draft)} values={['Open','In Progress','Review','Resolved','Rejected']} onChange={v=>save({status:v})}/><SelectField label="Priority" value={draft.priority} values={PRIORITIES} onChange={v=>save({priority:v})}/></div></DetailSection><DetailSection title="Ownership"><div className="detail-grid"><label>Assignee<input value={draft.assignee||''} onChange={e=>setDraft({...draft,assignee:e.target.value})} onBlur={e=>save({assignee:e.target.value})}/></label><label>Submitted by<input readOnly value={draft.submittedBy||user.name}/></label></div></DetailSection><DetailSection title="Planning"><label>Due date<input type="date" value={draft.due||''} onChange={e=>save({due:e.target.value})}/></label></DetailSection><DetailSection title="Discussion"><form className="comment-form" onSubmit={submitComment}><MessageCircle size={17}/><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a comment…"/><button className="primary-button" disabled={!comment.trim()}>Comment</button></form>{detail?.comments?.map(c=><div className="comment-list" key={c.id}><div><strong>{c.name}</strong><p>{c.body}</p><small>{relativeDate(c.createdAt)}</small></div></div>)}</DetailSection><DetailSection title="Activity"><div className="detail-activity">{detail?.activity?.map(a=><div key={a.id}><Clock3 size={14}/><p><strong>{a.name||'System'}</strong> {a.action==='created'?'created this task':a.action==='commented'?'commented':`updated ${a.metadata?.fields?.join(', ')||'this task'}`}<small>{relativeDate(a.createdAt)}</small></p></div>)}</div></DetailSection></div><div className="detail-footer"><button onClick={()=>save({archived:1})}><Archive size={15}/> Archive</button><button className="danger-button" onClick={remove}><Trash2 size={15}/> Delete</button></div></aside></div>;
}
function DetailSection({title,children}){return <section className="detail-section"><h3>{title}</h3>{children}</section>}
function MetricCard({ label, value }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
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

function SettingsPage({ project, setToast }) {
  const [name, setName] = useState(project.name);
  const [access, setAccess] = useState('link');
  return <section className="page settings-page"><PageHeading title="Settings"/><div className="settings-card"><section><div className="settings-section-head"><span><Settings2 size={20}/></span><div><h2>General</h2><p>Manage your project details.</p></div></div><label>Project name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Description<textarea placeholder="Optional project description" rows="4"/></label></section><section><div className="settings-section-head"><span><Users size={20}/></span><div><h2>Sharing & access</h2><p>Control who can view this project.</p></div></div><button className={access === 'invite' ? 'access-option selected' : 'access-option'} onClick={()=>setAccess('invite')}><ShieldCheck size={20}/><span><strong>Invite only</strong><small>Only people you invite by email can access this project.</small></span></button><button className={access === 'link' ? 'access-option selected' : 'access-option'} onClick={()=>setAccess('link')}><Users size={20}/><span><strong>Anyone with the link</strong><small>Anyone who has the link can view this project in read-only mode.</small></span></button>{access === 'link' && <div className="share-link"><input readOnly value="https://synqra-dashboard.ammarhisyam151.workers.dev"/><button onClick={()=>{navigator.clipboard?.writeText('https://synqra-dashboard.ammarhisyam151.workers.dev');setToast('Project link copied');}}>Copy</button></div>}<button className="primary-button settings-save" onClick={()=>setToast('Settings saved')}>Save</button></section><section className="danger-section"><div className="settings-section-head"><span><Archive size={20}/></span><div><h2>Danger zone</h2><p>Permanently delete this project and all associated feedback.</p></div></div><button>Delete project</button></section></div></section>;
}

function AdminPage({ user }) {
  const [admins, setAdmins] = useState([]); const [error, setError] = useState('');
  useEffect(() => { api('/api/admin/users').then(data => setAdmins(data.users)).catch(err => setError(err.message)); }, []);
  const superAdmins = admins.filter(person => person.role === 'super_admin').length;
  const regularAdmins = admins.filter(person => person.role === 'admin').length;
  return <section className="page admin-page"><PageHeading title="Admin Management" action={<button className="primary-button" onClick={()=>alert('Invite links require an email provider connection. Add Cloudflare Email or Resend before enabling invitations.')}><Users size={16}/> Invite Admin</button>}/><div className="admin-kpis"><MetricCard label="Total Admins" value={admins.length}/><MetricCard label="Super Admins" value={superAdmins}/><MetricCard label="Regular Admins" value={regularAdmins}/></div>{error ? <Empty text={error}/> : <div className="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Actions</th></tr></thead><tbody>{admins.map(person => <tr key={person.id}><td><strong>{person.email}{person.id === user.id && <small className="you">(You)</small>}</strong></td><td>{person.name}</td><td><StatusPill value={person.role === 'super_admin' ? 'Super admin' : person.role === 'admin' ? 'Admin' : 'Member'}/></td><td>{person.id !== user.id && <button className="row-action"><MoreHorizontal size={17}/></button>}</td></tr>)}</tbody></table></div>}</section>;
}

function ReviewModal({ onClose, onSave }) { const [form, setForm] = useState({title:'',description:'',area:'Design',priority:'Major',status:'Open',stage:'Planning',assignee:'Aria',due:'2026-09-18',meetingId:''}); const edit = (key,val)=>setForm(x=>({...x,[key]:val})); return <Modal title="Create task" subtitle="Add a new task to this project. You can fill in more details after creation." onClose={onClose}><form onSubmit={e=>{e.preventDefault(); if(form.title.trim())onSave(form)}}><label>Title<input autoFocus value={form.title} onChange={e=>edit('title',e.target.value)} placeholder="e.g. Fix pagination bug on list view" required/></label><label>Description<textarea value={form.description} onChange={e=>edit('description',e.target.value)} placeholder="Add context, links, or acceptance criteria…" rows="3"/></label><div className="form-grid"><SelectField label="Status" value={form.status} values={['Open','In Progress','Review','Resolved','Rejected']} onChange={v=>edit('status',v)}/><SelectField label="Priority" value={form.priority} values={PRIORITIES} onChange={v=>edit('priority',v)}/><SelectField label="Phase" value={form.stage} values={STAGES} onChange={v=>edit('stage',v)}/><SelectField label="Team" value={form.area} values={AREAS} onChange={v=>edit('area',v)}/><label>Assignee<input value={form.assignee} onChange={e=>edit('assignee',e.target.value)} placeholder="Unassigned"/></label><label>Related meeting<select value={form.meetingId} onChange={e=>edit('meetingId',e.target.value)}><option value="">No related meeting</option></select></label></div><label>Due date<input type="date" value={form.due} onChange={e=>edit('due',e.target.value)}/></label><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button">Create task <ArrowRight size={16}/></button></div></form></Modal>; }
function MeetingModal({ onClose, onSave }) { const [form,setForm]=useState({title:'',date:'2026-09-10',notes:'',ai:true}); const edit=(k,v)=>setForm(x=>({...x,[k]:v})); return <Modal title="New meeting" subtitle="Notes are saved to this project and can generate review items." onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(form.title.trim())onSave(form)}}><label>Meeting title<input autoFocus value={form.title} onChange={e=>edit('title',e.target.value)} placeholder="e.g. Design review" required/></label><label>Date<input type="date" value={form.date} onChange={e=>edit('date',e.target.value)}/></label><label>Notes<textarea value={form.notes} onChange={e=>edit('notes',e.target.value)} placeholder="One decision or action per line" rows="6"/></label><label className="switch-label"><input type="checkbox" checked={form.ai} onChange={e=>edit('ai',e.target.checked)}/><span>Prepare AI review suggestions</span></label><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button">Save meeting <ArrowRight size={16}/></button></div></form></Modal>; }
function SelectField({ label,value,values,onChange }) { return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)}>{values.map(v=><option key={v}>{v}</option>)}</select></label>; }
function Modal({title,subtitle,onClose,children}) { return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={19}/></button><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>; }

createRoot(document.getElementById('root')).render(<App/>);
