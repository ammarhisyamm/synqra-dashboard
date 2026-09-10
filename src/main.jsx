import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive, ArrowRight, Bell, CalendarBlank as CalendarDays, CalendarPlus, Check, CheckCircle as CheckCircle2, CaretDown as ChevronDown, CaretLeft as ChevronLeft, CaretRight as ChevronRight, CaretUpDown as ChevronsUpDown, Circle as CircleDot,
  ClipboardText as ClipboardList, Clock, Clock as Clock3, Copy, DownloadSimple as Download, ArrowSquareOut as ExternalLink, Eye, FileText, Flag, Folder, House as Home, Info, Kanban as KanbanSquare, Link as Link2, ListChecks, Lock,
  List as Menu, ChatCircle as MessageCircle, DotsThree as MoreHorizontal, DotsThreeVertical as MoreVertical, CursorClick as MousePointer2, PencilLine as Pencil, Plus, ArrowCounterClockwise as RotateCcw, MagnifyingGlass as Search, Gear as Settings, GearSix as Settings2, ShieldCheck, SlidersHorizontal, Sparkle as Sparkles, Table as Table2, Target, Trash as Trash2, Warning as TriangleAlert, ArrowUUpLeft as Undo2, User, UserPlus, EnvelopeSimple, Crown, Users, VideoCamera as Video, ChartBar, TrendUp, ChartLine, ChartPieSlice, Lightning, XCircle, X
} from '@phosphor-icons/react';
import './styles.css';
import './detail.css';
import './detail-overrides.css';
import './fixes.css';
import { Wave } from './components/Wave.jsx';
import './workflow.css';
import { STORAGE_KEY, AREAS, STAGES, PRIORITIES, STATUS_OPTIONS, STAGE_ICONS } from './constants/workflow';
import { dateLabel, slashDate, shortDate, ageLabel, groupDateLabel, relativeDate } from './lib/dates';
import { isResolved, isOverdue, activeReviews, portfolioProjects, taskOverview, sprintTasks, sprintStats, statusCounts, priorityCounts, teamWorkload, hoursTotals, formatHours, daysOverdue } from './lib/reports';
import { api } from './api/client';
import { reviewsApi } from './api/reviews';
import { reportsApi } from './api/reports';
import { notificationsApi } from './api/notifications';
import { projectsApi } from './api/projects';
import { workflowApi } from './api/workflow';
import { metadataApi } from './api/metadata';
import { meetingsApi } from './api/meetings';
import { NewProjectModal } from './components/projects/NewProjectModal';
import { DeleteProjectModal } from './components/projects/DeleteProjectModal';
import { CommandPalette } from './components/navigation/CommandPalette';
import { MeetingEditor } from './components/meetings/MeetingEditor';
import { KanbanWorkspace } from './components/kanban/KanbanWorkspace';

const REPORT_COLORS = {
  accent: '#111b30',
  accentSoft: '#64748b',
  info: '#7b8799',
  success: '#34445d',
  warning: '#53627a',
  danger: '#273650',
  muted: '#c5ceda'
};

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

function toKey(title) { return title.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
function statusFor(review) {
  if (review.status) return review.status;
  if (review.stage === 'Completed') return 'Resolved';
  if (review.stage === 'Final') return 'Review';
  if (review.stage === 'In Progress') return 'In Progress';
  return 'Open';
}
function nextTaskKey(reviews) {
  const numbers = reviews.map(r => { const match = /^AR-(\d+)$/.exec(r.key || ''); return match ? Number(match[1]) : 0; });
  return `AR-${Math.max(0, ...numbers) + 1}`;
}
function downloadReviewsCsv(reviews) {
  const columns = ['Key', 'Title', 'Description', 'Team', 'Phase', 'Priority', 'Assignee', 'Status', 'Due date', 'Archived'];
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = reviews.map(item => [item.key, item.title, item.description, item.area, item.stage, item.priority, item.assignee || 'Unassigned', statusFor(item), item.due, item.archived ? 'Yes' : 'No']);
  const csv = [columns, ...rows].map(row => row.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `synqra-reviews-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function elapsedLabel(minutes) {
  const total = Math.max(0, Math.floor(minutes || 0));
  if (total < 1) return '<1m';
  const days = Math.floor(total / 1440); const hours = Math.floor((total % 1440) / 60); const mins = total % 60;
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', mins ? `${mins}m` : ''].filter(Boolean).join(' ') || '<1m';
}
function makeHistoryModel(history, currentStatus, createdAt, now) {
  const timestamp = value => { const parsed = new Date(value).getTime(); return Number.isFinite(parsed) ? parsed : now; };
  const events = history?.length ? [...history].sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt)) : [{ id: 'initial', fromStatus: null, toStatus: currentStatus, createdAt, name: 'System' }];
  const timeline = events.map((event, index) => {
    const start = timestamp(event.createdAt); const end = events[index + 1] ? timestamp(events[index + 1].createdAt) : now;
    const minutes = Math.max(0, (end - start) / 60000);
    return { ...event, from: event.fromStatus || 'Created', minutes, spent: elapsedLabel(minutes) };
  });
  const totals = timeline.reduce((result, item) => { result[item.toStatus] = (result[item.toStatus] || 0) + item.minutes; return result; }, {});
  const activeMinutes = Math.max(0, (now - timestamp(createdAt)) / 60000);
  return { timeline, totals, activeMinutes };
}
function historyDateLabel(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }

function deduplicateNotifications(current, incoming) {
  if (!incoming || !Array.isArray(incoming)) return current;
  const seen = new Set();
  const result = [];
  // Prioritize newer or existing read state
  for (const item of incoming) {
    const key = item.id || `${item.title}-${item.createdAt}`;
    if (!seen.has(key)) {
      seen.add(key);
      const existing = current.find(c => c.id === item.id);
      result.push(existing ? { ...item, read: existing.read || item.read } : item);
    }
  }
  return result;
}

function App() {
  const [data, setData] = useState(loadData);
  const [cloudReady, setCloudReady] = useState(false);
  const [user, setUser] = useState(undefined);
  const [page, setPage] = useState('Overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('synqra-sidebar-collapsed') === '1'; } catch { return false; } });
  const toggleSidebar = () => {
    if (window.matchMedia('(max-width: 650px)').matches) setMenuOpen(open => !open);
    else setCollapsed(value => { try { localStorage.setItem('synqra-sidebar-collapsed', value ? '0' : '1'); } catch {} return !value; });
  };
  const [projectOpen, setProjectOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [dialog, setDialog] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedReview, setSelectedReview] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data]);
  useEffect(() => {
    const requestedProjectId = new URLSearchParams(window.location.search).get('project');
    api('/api/auth/me').then(({ user: signedInUser }) => {
      setUser(signedInUser);
      return api('/api/bootstrap');
    }).then(remote => {
      const requestedProject = requestedProjectId && requestedProjectId !== 'default' ? remote.projects.find(item => item.id === requestedProjectId) : null;
      setData({ ...remote, project: requestedProject || remote.project });
      setCloudReady(true);
    }).catch(() => { setUser(null); setCloudReady(false); });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const onShortcut = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(open => !open); }
      if (event.key === 'Escape') { setCommandOpen(false); setNotificationsOpen(false); }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);
  useEffect(() => {
    if (page !== 'All Reviews') setQuery('');
  }, [page]);

  const activeProjectId = data.project?.id || 'default';
  const activeReviews = useMemo(() => data.reviews.filter(r => !r.archived && (activeProjectId === 'default' ? (!r.projectId || r.projectId === 'default') : r.projectId === activeProjectId)), [data.reviews, activeProjectId]);
  const activeMeetings = useMemo(() => data.meetings.filter(meeting => activeProjectId === 'default' ? (!meeting.projectId || meeting.projectId === 'default') : meeting.projectId === activeProjectId), [data.meetings, activeProjectId]);
  const activeWorkload = useMemo(() => {
    const counts = activeReviews.filter(review => review.stage !== 'Completed').reduce((result, review) => {
      const assignee = review.assignee || 'Unassigned';
      result[assignee] = (result[assignee] || 0) + 1;
      return result;
    }, {});
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([assignee, count]) => ({ assignee, count }));
  }, [activeReviews]);
  const activeReportByStatus = useMemo(() => Object.entries(activeReviews.reduce((result, review) => {
    result[review.stage] = (result[review.stage] || 0) + 1;
    return result;
  }, {})).map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count), [activeReviews]);
  const activeSprints = useMemo(() => (data.sprints || []).filter(sprint => !sprint.projectId || sprint.projectId === activeProjectId), [data.sprints, activeProjectId]);
  const updateReview = async (id, patch) => {
    const previous = data.reviews.find(item => item.id === id);
    if (!previous) return;
    setData(prev => ({ ...prev, reviews: prev.reviews.map(r => r.id === id ? { ...r, ...patch } : r) }));
    try {
      const saved = await reviewsApi.update(id, patch);
      setData(prev => ({ ...prev, reviews: prev.reviews.map(item => item.id === id ? { ...item, ...saved } : item) }));
      return saved;
    } catch (error) {
      setData(prev => ({ ...prev, reviews: prev.reviews.map(item => item.id === id ? previous : item) }));
      setToast(error.message);
    }
  };
  const addReview = (review) => {
    const saved = { id: crypto.randomUUID(), createdAt: new Date().toISOString().slice(0, 10), archived: false, projectId: data.project?.id || 'default', ...review };
    if (!/^AR-\d+$/.test(saved.key || '')) saved.key = nextTaskKey(data.reviews);
    setData(prev => ({ ...prev, reviews: [saved, ...prev.reviews] }));
    reviewsApi.create(saved).then(created => {
      setData(prev => ({ ...prev, reviews: prev.reviews.map(r => r.id === saved.id ? created : r) }));
    }).catch(error => { setData(prev => ({ ...prev, reviews: prev.reviews.filter(item => item.id !== saved.id) })); setToast(error.message); });
  };
  const addSprint = async sprint => {
    const optimistic = { id: crypto.randomUUID(), projectId: activeProjectId, ...sprint };
    setData(prev => ({ ...prev, sprints: [optimistic, ...(prev.sprints || [])] }));
    try {
      const created = await workflowApi.createSprint(optimistic);
      setData(prev => ({ ...prev, sprints: (prev.sprints || []).map(item => item.id === optimistic.id ? created : item) }));
      setToast('Sprint created');
      return created;
    } catch (error) {
      setData(prev => ({ ...prev, sprints: (prev.sprints || []).filter(item => item.id !== optimistic.id) }));
      setToast(error.message);
      throw error;
    }
  };
  const updateSprint = async (id, patch) => {
    const previous = (data.sprints || []).find(item => item.id === id);
    if (!previous) return;
    setData(prev => ({ ...prev, sprints: (prev.sprints || []).map(item => item.id === id ? { ...item, ...patch } : item) }));
    try {
      const saved = await workflowApi.updateSprint(id, patch);
      setData(prev => ({ ...prev, sprints: (prev.sprints || []).map(item => item.id === id ? saved : item) }));
      setToast(`Sprint ${saved.status}`);
    } catch (error) {
      setData(prev => ({ ...prev, sprints: (prev.sprints || []).map(item => item.id === id ? previous : item) }));
      setToast(error.message);
    }
  };
  const showSuccess = (title, subtitle, ctaLabel, onCta) => setDialog({ success: true, icon: <CheckCircle2 size={24}/>, title, subtitle, ctaLabel, onCta });
  const archiveReview = (id) => {
    const target = data.reviews.find(r => r.id === id);
    setDialog({ icon: <Archive size={24}/>, title: 'Archive this review?', subtitle: target ? `"${target.title}" will be moved to Archive. You can restore it anytime.` : 'This review will be moved to Archive.', confirmLabel: 'Archive', onConfirm: () => updateReview(id, { archived: true }) });
  };
  const restoreReview = (id) => {
    const target = data.reviews.find(r => r.id === id);
    setDialog({ icon: <Undo2 size={24}/>, title: 'Restore this review?', subtitle: target ? `"${target.title}" will be moved back to the board.` : 'This review will be moved back to the board.', confirmLabel: 'Restore', onConfirm: () => updateReview(id, { archived: false }) });
  };
  const addMeeting = async (meeting) => {
    const saved = { id: crypto.randomUUID(), itemCount: 0, projectId: activeProjectId, ...meeting };
    setData(prev => ({ ...prev, meetings: [saved, ...prev.meetings] }));
    try {
      const created = await meetingsApi.create(saved);
      setData(prev => ({ ...prev, meetings: prev.meetings.map(item => item.id === saved.id ? created : item) }));
      return created;
    } catch (error) {
      setData(prev => ({ ...prev, meetings: prev.meetings.filter(item => item.id !== saved.id) }));
      setToast(error.message);
      throw error;
    }
  };
  const deleteMeeting = (id) => {
    const target = data.meetings.find(m => m.id === id);
    setDialog({ danger: true, icon: <Trash2 size={24}/>, title: 'Delete this meeting?', subtitle: target ? `"${target.title}" and its notes will be permanently deleted.` : 'This meeting will be permanently deleted.', confirmLabel: 'Delete', onConfirm: () => {
      setData(prev => ({ ...prev, meetings: prev.meetings.filter(m => m.id !== id) }));
      meetingsApi.remove(id).catch(error => setToast(error.message));
    } });
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'synqra-export.json'; a.click(); URL.revokeObjectURL(url);
    setToast('Project data exported');
  };
  const refreshMetadata = async () => { try { const result = await metadataApi.list(); setData(previous => ({ ...previous, metadata: result.metadata })); } catch (error) { setToast(error.message); } };
  const refreshAll = () => { api('/api/bootstrap').then(remote => { setData(previous => { const selectedId = previous.project?.id; const selectedProject = selectedId && selectedId !== 'default' ? remote.projects.find(item => item.id === selectedId) : remote.project; return { ...remote, project: selectedProject || remote.project }; }); setCloudReady(true); }).catch(error => setToast(error.message)); };
  const signOut = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } finally { setUser(null); setCloudReady(false); setData(seed); } };
  const saveProject = async settings => {
    try {
      const isDefaultProject = activeProjectId === 'default';
      const saved = await api(isDefaultProject ? '/api/project-settings' : `/api/projects/${activeProjectId}`, {
        method: 'PATCH',
        body: JSON.stringify(isDefaultProject ? settings : { name: settings.name, description: settings.description })
      });
      const project = isDefaultProject ? saved : { ...data.project, ...settings, initials: settings.name.slice(0, 1).toUpperCase() };
      setData(prev => ({ ...prev, project, projects: (prev.projects || []).map(item => item.id === project.id ? { ...item, ...project } : item) }));
      setToast('Settings saved');
    } catch (error) { setToast(error.message); }
  };
  const refreshNotifications = async () => { try { const result = await notificationsApi.list(); setNotifications(prev => deduplicateNotifications(prev, result.notifications)); } catch (error) { setToast(error.message); } };
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const sync = async () => {
      try {
        const [remote, notificationResult] = await Promise.all([api('/api/bootstrap'), notificationsApi.list()]);
        if (!active) return;
        setData(previous => {
          const selectedId = previous.project?.id;
          const selectedProject = selectedId && selectedId !== 'default' ? remote.projects.find(item => item.id === selectedId) : remote.project;
          return { ...remote, project: selectedProject || remote.project };
        });
        setNotifications(prev => deduplicateNotifications(prev, notificationResult.notifications));
      } catch { /* keep the current optimistic view and retry on the next tick */ }
    };
    sync();
    const interval = window.setInterval(sync, 10000);
    return () => { active = false; window.clearInterval(interval); };
  }, [user]);
  const markNotificationRead = async notification => { try { await notificationsApi.read(notification.id); setNotifications(items => items.map(item => item.id === notification.id ? { ...item, read: true } : item)); setData(prev => ({ ...prev, unreadNotifications: Math.max(0, (prev.unreadNotifications || 0) - (notification.read ? 0 : 1)) })); } catch (error) { setToast(error.message); } };
  const markAllNotificationsRead = async () => { try { await notificationsApi.readAll(); setNotifications(items => items.map(item => ({ ...item, read: true }))); setData(prev => ({ ...prev, unreadNotifications: 0 })); } catch (error) { setToast(error.message); } };
  const createProject = async name => { try { const created = await projectsApi.create({ name }); const project = { ...created, initials: name.slice(0, 1).toUpperCase() }; setData(prev => ({ ...prev, project, projects: [...(prev.projects || []).filter(item => item.id !== project.id), project] })); setProjectOpen(false); setModal(null); setPage('Overview'); setToast('Project created'); } catch (error) { setToast(error.message); throw error; } };
  const deleteProject = async projectId => {
    try {
      await projectsApi.remove(projectId);
      const fallback = (data.projects || []).find(item => item.id !== projectId) || { id: 'default', name: 'Acme Redesign', initials: 'A' };
      setData(previous => ({ ...previous, project: fallback, projects: (previous.projects || []).filter(item => item.id !== projectId), reviews: previous.reviews.filter(item => item.projectId !== projectId), meetings: previous.meetings.filter(item => item.projectId !== projectId) }));
      setModal(null); setProjectOpen(false); setPage('Overview'); setToast('Project deleted');
    } catch (error) { setToast(error.message); throw error; }
  };
  const openNewMeeting = () => { setModal(null); setPage('Meeting Editor'); };
  const createMeetingFromEditor = async ({ meeting, items }) => {
    try {
      const created = await addMeeting({ ...meeting, projectId: activeProjectId, itemCount: items.length });
      items.forEach(item => addReview({ title: item.title, description: item.description, area: item.area, priority: item.priority, stage: 'Planning', status: 'Open', assignee: item.assignee, due: item.due, meetingId: created.id }));
      setPage('Meetings');
      showSuccess(`${items.length} review item${items.length === 1 ? '' : 's'} created`, 'The meeting and its selected action items are now synced to the project.', 'View board', () => setPage('Board'));
    } catch { /* addMeeting already surfaced the error */ }
  };

  if (user === undefined) return <AuthLoading/>;
  if (!user) return <AuthScreen onAuthenticated={signedInUser => { setUser(signedInUser); api('/api/bootstrap').then(remote => { setData(remote); setCloudReady(true); }).catch(() => setCloudReady(false)); }}/>;

  return <div className={`app-shell${collapsed ? ' collapsed' : ''}`}>
    <Sidebar page={page} setPage={setPage} menuOpen={menuOpen} setMenuOpen={setMenuOpen} collapsed={collapsed} onMenuClick={toggleSidebar} user={user} onSignOut={signOut} project={data.project} onProjectClick={() => setProjectOpen(!projectOpen)} />
    <main className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={toggleSidebar} aria-label="Toggle menu"><Menu size={20}/></button>
        <label className="global-search" onClick={() => setCommandOpen(true)}><Search size={17}/><input value={query} onFocus={() => setCommandOpen(true)} onChange={e=>{setQuery(e.target.value);setCommandOpen(true)}} placeholder="Search…"/><kbd>⌘K</kbd></label>
        <div className="topbar-actions">
          <button className="collaborator" onClick={() => setCollabOpen(true)}><Users size={16}/> Collaborator</button>
          <button className="notification" aria-label="Notifications" onClick={()=>{setNotificationsOpen(open=>!open);if(!notifications.length)refreshNotifications()}}><Bell size={17}/>{data.unreadNotifications > 0 && <i/>}</button>
        </div>
      </header>
      {commandOpen && <CommandPalette query={query} setQuery={setQuery} reviews={activeReviews} projects={data.projects || []} activeProjectId={activeProjectId} onClose={() => setCommandOpen(false)} onNavigate={pageName => { setPage(pageName); setQuery(''); }} onNewMeeting={openNewMeeting} onNewReview={() => setModal('review')} onOpenReview={review => { setSelectedReview(review); setQuery(''); }} onSelectProject={selected => { setData(previous => ({ ...previous, project: selected })); setPage('Overview'); setQuery(''); }}/ >}
      {notificationsOpen && <NotificationMenu notifications={notifications} onClose={()=>setNotificationsOpen(false)} onOpen={setSelectedReview} onRead={markNotificationRead} onReadAll={markAllNotificationsRead}/>} 
      {projectOpen && <ProjectSwitcher project={data.project} projects={data.projects || []} onSelect={selected => { setData(prev => ({ ...prev, project: selected })); setProjectOpen(false); setPage('Overview'); }} onNew={() => { setProjectOpen(false); setModal('project'); }} onClose={() => setProjectOpen(false)} />}
      {collabOpen && <CollaboratorModal user={user} onClose={() => setCollabOpen(false)} onToast={setToast} />}
      {page === 'Overview' && <Dashboard reviews={activeReviews} meetings={activeMeetings} workload={activeWorkload} reportByStatus={activeReportByStatus} sprints={activeSprints} goTo={setPage} onSubmitReview={() => setModal('review')} onNewMeeting={openNewMeeting} />}
      {page === 'All Reviews' && <Reviews reviews={activeReviews} query={query} setQuery={setQuery} updateReview={updateReview} archiveReview={archiveReview} setModal={setModal} onOpen={setSelectedReview} />}
      {page === 'Meetings' && <Meetings meetings={activeMeetings} reviews={activeReviews} addMeeting={addMeeting} addReview={addReview} onDeleteMeeting={deleteMeeting} setToast={setToast} setModal={setModal} onNewMeeting={openNewMeeting} onTasksCreated={count => showSuccess(`${count} review items created`, 'Action items from the meeting notes are now on the board.', 'View board', () => setPage('Board'))} onOpen={setSelectedReview} />}
      {page === 'Meeting Editor' && <MeetingEditor user={user} onClose={() => setPage('Meetings')} onToast={setToast} onCreate={createMeetingFromEditor} />}
      {page === 'Board' && <KanbanWorkspace reviews={activeReviews} sprints={activeSprints} metadata={(data.metadata || []).filter(item => !item.projectId || item.projectId === activeProjectId)} projectId={activeProjectId} updateReview={updateReview} createSprint={addSprint} updateSprint={updateSprint} refreshMetadata={refreshMetadata} setModal={setModal} onOpen={setSelectedReview} />}
      {page === 'Archive' && <ArchivePage reviews={data.reviews.filter(r => r.archived)} restoreReview={restoreReview} />}
      {page === 'Reports' && <Reports reviews={data.reviews} projects={data.projects || []} sprints={data.sprints || []} projectName={data.project.name} onRefresh={refreshAll} onOpen={setSelectedReview} />}
      {page === 'Settings' && <SettingsPageEnhanced project={data.project} user={user} saveProject={saveProject} setToast={setToast} onDeleteProject={() => setModal('delete-project')} />}
      {page === 'Admin' && <AdminPageEnhanced user={user} setToast={setToast}/>}
    </main>
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
    {modal === 'review' && <ReviewModal meetings={activeMeetings} onClose={() => setModal(null)} onSave={(review) => { addReview(review); setModal(null); showSuccess('Review created', `"${review.title}" is now on the board.`, 'View All Reviews', () => setPage('All Reviews')); }} />}
    {modal === 'meeting' && <MeetingModal onClose={() => setModal(null)} onSave={async meeting => { await addMeeting(meeting); setModal(null); showSuccess('Meeting saved', `"${meeting.title}" has been added to Meetings.`, 'View Meetings', () => setPage('Meetings')); }} />}
    {modal === 'project' && <NewProjectModal onClose={() => setModal(null)} onCreate={createProject} />}
    {modal === 'delete-project' && data.project?.id !== 'default' && <DeleteProjectModal project={data.project} onClose={() => setModal(null)} onDelete={deleteProject} />}
    {selectedReview && <ReviewDetailEnhanced review={selectedReview} meetings={activeMeetings} metadata={(data.metadata || []).filter(item => !item.projectId || item.projectId === activeProjectId)} sprints={activeSprints} user={user} onClose={() => setSelectedReview(null)} onUpdated={saved => { setData(prev => ({...prev, reviews: prev.reviews.map(r => r.id === saved.id ? {...r, ...saved} : r)})); setSelectedReview(saved); }} onDeleted={id => { setData(prev => ({...prev, reviews: prev.reviews.filter(r => r.id !== id)})); setSelectedReview(null); showSuccess('Task deleted', 'The task has been permanently removed.', 'Done'); }} onToast={setToast} onRemoveRequest={doDelete => setDialog({ danger: true, icon: <Trash2 size={24}/>, title: 'Delete this task?', subtitle: 'This task and its comments will be permanently deleted.', confirmLabel: 'Delete', onConfirm: doDelete })} />}
    {dialog && <ActionDialog dialog={dialog} onClose={() => setDialog(null)} />}
    <footer className="app-footer"><span>{cloudReady ? 'Synced with Cloudflare D1' : 'Local draft — reconnecting to Cloudflare'}</span></footer>
  </div>;
}

function GlobalSearchResults({ query, reviews, onOpen, onClear }) {
  const matches = reviews.filter(r => `${r.title} ${r.description || ''} ${r.assignee || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  return <div className="global-search-results"><div className="search-results-head">Search results <button onClick={onClear}><X size={14}/></button></div>{matches.length ? matches.map(r => <button key={r.id} onClick={()=>{onOpen(r);onClear()}}><span className="dot"/><span><strong>{r.title}</strong><small>{r.area} · {statusFor(r)}</small></span><ArrowRight size={15}/></button>) : <p>No matching tasks.</p>}</div>;
}
function NotificationMenu({ notifications, onClose, onOpen, onRead, onReadAll }) {
  return <div className="notification-menu"><div className="search-results-head"><span>Notifications</span><span><button className="notification-read-all" onClick={onReadAll}>Mark all read</button><button onClick={onClose}><X size={14}/></button></span></div>{notifications.length ? notifications.slice(0, 8).map(item => <button className={item.read ? 'read' : 'unread'} key={item.id} onClick={()=>{onRead(item);if(item.reviewId){onOpen({id:item.reviewId,title:item.title});}onClose()}}><span className="notification-icon"><Bell size={14}/></span><span><strong>{item.title}</strong><small>{item.body} · {relativeDate(item.createdAt)}</small></span>{!item.read && <i className="notification-unread-dot"/>}</button>) : <p>No notifications yet.</p>}</div>;
}

function Sidebar({ page, setPage, menuOpen, setMenuOpen, collapsed, onMenuClick, user, onSignOut, project, onProjectClick }) {
  const workspace = [["Overview", Home], ["All Reviews", MessageCircle], ["Meetings", CalendarDays], ["Board", KanbanSquare], ["Reports", ChartBar], ["Archive", Archive]];
  const go = name => { setPage(name); setMenuOpen(false); };
  return <aside className={`sidebar${menuOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
    <div className="sidebar-head">
      <button className="sidebar-menu-btn" onClick={onMenuClick} aria-label="Toggle sidebar"><Menu size={22}/></button>
      <div className="sidebar-brand"><img className="synqra-logo" src="/logo-synqra.png" alt="Synqra — Powered by MULIA"/></div>
    </div>
    <div className="sidebar-scroll">
      <section><p className="side-label">PROJECT</p><button className="project-select" title={project.name} onClick={onProjectClick}><Folder size={20}/><span>{project.name}</span><ChevronsUpDown size={17}/></button></section>
      <section><p className="side-label">WORKSPACE</p><nav className="side-nav">{workspace.map(([name, Icon]) => <button key={name} title={name} className={page === name ? 'active' : ''} onClick={() => go(name)}><Icon size={20} weight={page === name ? 'fill' : 'regular'}/><span>{name}</span></button>)}</nav></section>
    </div>
    <div className="sidebar-foot">
      <p className="side-label">MANAGEMENT</p>
      <nav className="side-nav">
        <button title="Settings" className={page === 'Settings' ? 'active' : ''} onClick={() => go('Settings')}><Settings size={20} weight={page === 'Settings' ? 'fill' : 'regular'}/><span>Settings</span></button>
        {['super_admin','admin'].includes(user.role) && <button title="Admin Management" className={page === 'Admin' ? 'active' : ''} onClick={() => go('Admin')}><ShieldCheck size={20} weight={page === 'Admin' ? 'fill' : 'regular'}/><span>Admin Management</span></button>}
      </nav>
      <button className="user-card" title={`${user.name} — Sign out`} onClick={onSignOut}><div className="avatar avatar-dark">{user.name.slice(0,2).toUpperCase()}</div><div><strong>{user.name}</strong><small>{user.email}</small></div><MoreVertical size={18}/></button>
    </div>
  </aside>;
}

function SynqraMark() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5 28.5 9.7v12.6L16 29.5 3.5 22.3V9.7Z" fill="none" stroke="#10182b" strokeWidth="3" strokeLinejoin="round"/><path d="M18.2 6.5 10.8 17.2h4.6L14 25.5l7.4-10.7h-4.6Z" fill="#10182b"/></svg>;
}

function AuthLoading() { return <div className="auth-shell"><div className="auth-card auth-loading"><Wave style={{ fontSize: 24 }} /><strong>Checking your session…</strong></div></div>; }
function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); const [form, setForm] = useState({ name:'', email:'', identifier:'', password:'' }); const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const submit = async event => { event.preventDefault(); setPending(true); setError(''); try { const payload = mode === 'login' ? { identifier: form.identifier, password: form.password } : { name: form.name, email: form.email, password: form.password }; const result = await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { method:'POST', body:JSON.stringify(payload) }); onAuthenticated(result.user); } catch (err) { setError(err.message); } finally { setPending(false); } };
  return <div className="auth-shell"><section className="auth-card"><div className="auth-brand"><img className="synqra-logo auth-logo" src="/logo-synqra.png" alt="Synqra — Powered by MULIA"/></div><h1>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1><p>{mode === 'login' ? 'Sign in to continue to your project reviews.' : 'Your first account becomes the workspace super admin.'}</p><form onSubmit={submit}>{mode === 'register' && <label>Name<input value={form.name} onChange={e=>update('name',e.target.value)} autoComplete="name" required/></label>}{mode === 'login' ? <label>Username or email<input value={form.identifier} onChange={e=>update('identifier',e.target.value)} autoComplete="username" required/></label> : <label>Email<input type="email" value={form.email} onChange={e=>update('email',e.target.value)} autoComplete="email" required/></label>}<label>Password<input type="password" value={form.password} onChange={e=>update('password',e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="6" required/><small>At least 6 characters.</small></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button" disabled={pending}>{pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16}/></button></form><button className="auth-toggle" onClick={()=>{setMode(mode === 'login' ? 'register' : 'login');setError('');}}>{mode === 'login' ? 'New to Synqra? Create an account' : 'Already have an account? Sign in'}</button></section></div>;
}

function CollaboratorModal({ user, onClose, onToast }) {
  const [members, setMembers] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [pending, setPending] = useState(false);
  const load = () => api('/api/project-members').then(data => setMembers(data.members)).catch(error => onToast(error.message));
  useEffect(load, []);
  const invite = async event => {
    event.preventDefault();
    const value = email.trim();
    if (!value || pending) return;
    setPending(true);
    try {
      await api('/api/project-members', { method: 'POST', body: JSON.stringify({ email: value, role }) });
      setEmail('');
      await load();
      onToast(`Invitation sent to ${value}`);
    } catch (error) { onToast(error.message); } finally { setPending(false); }
  };
  const remove = async member => {
    try { await api(`/api/project-members/${member.id}`, { method: 'DELETE' }); await load(); }
    catch (error) { onToast(error.message); }
  };
  const updateRole = async (member, nextRole) => { try { await api(`/api/project-members/${member.id}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }); await load(); onToast(`${member.email} is now ${nextRole}`); } catch (error) { onToast(error.message); } };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="collab-modal" onMouseDown={e => e.stopPropagation()}><span className="collab-icon"><Plus size={22}/></span><h2>Collaborator</h2><p className="collab-subtitle">Undang anggota dan atur akses tiap orang: Editor atau Viewer.</p><form className="collab-invite-row" onSubmit={invite}><label className="collab-email"><EnvelopeSimple size={16}/><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Masukkan alamat email" required/></label><AppSelect value={role} options={['viewer','editor']} onChange={setRole} ariaLabel="Invite role"/><button className="primary-button" disabled={pending || !email.trim()}><UserPlus size={16}/> Undang</button></form><p className="collab-note"><strong>Editor</strong> dapat menambah &amp; mengubah review item · <strong>Viewer</strong> hanya bisa melihat.</p><div className="collab-owner"><span className="collab-crown"><Crown size={16}/></span><div><strong>{user.name}</strong><small>{user.email}</small></div><span className="owner-pill">Owner</span></div>{members === null ? <div className="empty-state"><Wave /> Loading members…</div> : members.length ? <div className="collab-list">{members.map(member => <div className="collab-row" key={member.id}><div className="avatar">{member.email.slice(0, 2).toUpperCase()}</div><div><strong>{member.email}</strong><small>Invited {relativeDate(member.createdAt)}</small></div><AppSelect value={member.role} options={['viewer','editor']} onChange={nextRole => updateRole(member, nextRole)} ariaLabel={`Role for ${member.email}`}/><button className="row-action" onClick={() => remove(member)} aria-label={`Remove ${member.email}`}><Trash2 size={15}/></button></div>)}</div> : <p className="collab-empty">Belum ada anggota yang diundang.</p>}</section></div>;
}

function ProjectSwitcher({ project, projects = [], onSelect, onNew, onClose }) {
  const [query, setQuery] = useState('');
  const visible = projects.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="project-switcher"><div className="switcher-title">PROJECT</div><button className="current-project" onClick={onClose}><Folder size={22}/><span>{project.name}</span><ChevronDown size={17}/></button><label className="project-search"><Search size={19}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects"/></label><div className="project-list">{visible.length ? visible.map(item => <button key={item.id} className={item.id === project.id ? 'selected' : ''} onClick={() => onSelect(item)}><Folder size={19}/><span>{item.name}</span>{item.id === project.id && <Check size={20}/>}</button>) : <p className="project-empty">No projects found.</p>}</div><button className="new-project" onClick={onNew}><Plus size={21}/> New project</button><button className="switcher-close" onClick={onClose} aria-label="Close"><X size={17}/></button></div>;
}

function Dashboard({ reviews, meetings, workload, reportByStatus, sprints, goTo, onSubmitReview, onNewMeeting }) {
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const today = new Date().toISOString().slice(0, 10);
  const needsAttention = reviews.filter(r => r.stage !== 'Completed' && (r.priority === 'Blocker' || r.due < today)).slice(0, 4);
  const completed = reviews.filter(r => r.stage === 'Completed').length;
  const blockers = reviews.filter(r => r.priority === 'Blocker').length;
  const overdue = reviews.filter(r => r.due < today && r.stage !== 'Completed').length;
  return <section className="page dashboard-page">
    <div className="page-title"><div><h1>Overview</h1><p>{day}</p></div><button className="primary-button" onClick={onSubmitReview}><Plus size={16}/> Submit Review</button></div>
    <div className="dashboard-grid">
      <div className="dashboard-main">
        <SectionHead title="Needs attention" action={() => goTo('All Reviews')} />
        <div className="attention-list">{needsAttention.length ? needsAttention.map(r => <AttentionCard key={r.id} review={r} today={today} onReview={() => goTo('All Reviews')}/>) : <Empty text="Nothing needs attention right now."/>}</div>
        <SectionHead title="Active stages" aside={`${reviews.length ? new Set(reviews.map(review => review.stage)).size : 0} stages`} />
        {reviews.length ? <div className="stage-grid">{STAGES.map((stage, index) => {
          const items = reviews.filter(r => r.stage === stage);
          const done = items.filter(r => r.stage === 'Completed' || r.stage === 'Final').length;
          const blocked = items.some(r => r.priority === 'Blocker');
          const Icon = STAGE_ICONS[index];
          return <article className="stage-card" key={stage}><div className="card-meta"><Icon size={18}/><StatusPill value={blocked ? 'Blocked' : stage === 'Completed' || stage === 'Final' ? 'Complete' : 'In progress'} /></div><h3>{stage}</h3><div className="progress-row"><div className="progress"><span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}/></div><small>{done}/{items.length}</small></div></article>;
        })}</div> : <div className="dashboard-empty"><ClipboardList size={25}/><strong>No review items yet</strong><p>Submit your first review to see stages appear here.</p><button className="primary-button" onClick={onSubmitReview}><Plus size={16}/> Submit Review</button></div>}
        <SectionHead title="Team Workload" aside="active tasks per member" />
        <div className="workload-chart">{workload.length ? [...workload].sort((a, b) => Number(b.count) - Number(a.count)).slice(0, 8).map(item => { const max = Math.max(1, ...workload.map(w => Number(w.count))); return <div className="wl-row" key={item.assignee}><span className="wl-name">{item.assignee}</span><div className="wl-bar"><i style={{ width: `${Number(item.count) / max * 100}%` }}/></div><span className="wl-count">{item.count}</span></div>; }) : <Empty text="No active workload yet."/>}</div>
        <SectionHead title="Recent activity" action={() => goTo('All Reviews')} />
        <div className="activity-panel">{[...reviews].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(r => <div className="activity-row" key={r.id}><span className={`dot ${r.priority.toLowerCase()}`}/><div><strong>{r.title}</strong><p>{r.area} · {r.stage}</p></div><time>{relativeDate(r.createdAt)}</time></div>)}</div>
      </div>
      <div className="dashboard-rail"><MeetingRail meetings={meetings} goTo={goTo} onNew={onNewMeeting}/><Summary reviews={reviews} completed={completed} blockers={blockers} overdue={overdue}/><SprintSummary sprints={sprints} reviews={reviews}/></div>
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
function MeetingRail({ meetings, goTo, onNew }) { return <aside className="rail-card"><div className="rail-head"><h2>Meetings</h2><button className="new-btn" onClick={onNew}><Plus size={14}/> New</button></div>{meetings.length ? meetings.slice(0, 4).map(m => <button className="meeting-row" key={m.id} onClick={() => goTo('Meetings')}><span className="meeting-icon"><CalendarDays size={16}/></span><span><strong>{m.title}</strong><small>{dateLabel(m.date)}</small></span>{m.ai && <Sparkles size={15} className="meeting-ai"/>}</button>) : <div className="meeting-empty"><CalendarPlus size={27}/><strong>No meetings yet</strong><p>Start a quick review or schedule one for later.</p><div><button className="primary-button" onClick={onNew}><CalendarPlus size={14}/> Quick start</button><button className="secondary-button" onClick={() => goTo('Meetings')}>View all</button></div></div>}<button className="view-all" onClick={() => goTo('Meetings')}>View all <ArrowRight size={14}/></button></aside>; }
function Summary({ reviews, completed, blockers, overdue }) { return <aside className="rail-card summary"><h2>Summary</h2><p>Project overview</p><div className="summary-list"><Metric label="Total reviews" value={reviews.length}/><Metric label="Resolved" value={completed}/><Metric label="Blockers" value={blockers}/><Metric label="Open items" value={reviews.length - completed}/><Metric label="Areas" value={new Set(reviews.map(r => r.area)).size}/></div><div className="summary-alert"><Info size={15}/><span>{blockers ? `${blockers} blocker · ` : ''}{overdue} overdue need attention.</span></div></aside>; }
function SprintSummary({ sprints, reviews }) { const sprint = sprints.find(item => item.status === 'active') || sprints[0]; if (!sprint) return null; const items = reviews.filter(item => item.sprintId === sprint.id || item.sprint === sprint.name); const done = items.filter(item => item.stage === 'Completed' || statusFor(item) === 'Resolved').length; return <aside className="rail-card sprint-summary"><h2>{sprint.name}</h2><p>{sprint.status} sprint{items.length ? ` · ${done}/${items.length} done` : ''}</p><div className="progress"><span style={{width:`${items.length ? done / items.length * 100 : 0}%`}}/></div><small>{sprint.goal || 'No sprint goal yet.'}</small></aside>; }
function Metric({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function Reviews({ reviews, query, setQuery, updateReview, archiveReview, setModal, onOpen }) {
  const [status, setStatus] = useState('All statuses');
  const [priority, setPriority] = useState('All priorities');
  const [owner, setOwner] = useState('All owners');
  const [phase, setPhase] = useState('All phases');
  const [pageIdx, setPageIdx] = useState(0);
  const [selected, setSelected] = useState([]);
  const today = new Date().toISOString().slice(0, 10);
  const owners = useMemo(() => [...new Set(reviews.map(r => r.assignee))], [reviews]);
  const filtered = reviews.filter(r =>
    (status === 'All statuses' || statusFor(r) === status) &&
    (priority === 'All priorities' || r.priority === priority) &&
    (owner === 'All owners' || r.assignee === owner) &&
    (phase === 'All phases' || r.stage === phase) &&
    `${r.title} ${r.description || ''} ${r.assignee || ''}`.toLowerCase().includes(query.toLowerCase()));
  const allSelected = filtered.length > 0 && filtered.every(r => selected.includes(r.id));
  const toggleAll = () => setSelected(allSelected ? selected.filter(id => !filtered.some(r => r.id === id)) : [...new Set([...selected, ...filtered.map(r => r.id)])]);
  const open = reviews.filter(r => statusFor(r) === 'Open').length;
  const dueToday = reviews.filter(r => r.due === today).length;
  const overdue = reviews.filter(r => r.due < today && statusFor(r) !== 'Resolved').length;
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(pageIdx, pages - 1);
  const rows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const from = filtered.length ? safePage * pageSize + 1 : 0;
  const to = Math.min(filtered.length, safePage * pageSize + pageSize);
  const archiveSelected = () => { selected.forEach(id => updateReview(id, { archived: true })); setSelected([]); };
  return <section className="page reviews-page"><PageHeading title="All Reviews" action={<div className="heading-actions"><button className="secondary-button" onClick={() => downloadReviewsCsv(filtered)}><Download size={16}/> Export CSV</button><button className="primary-button" onClick={() => setModal('review')}><Plus size={17}/> Submit Review</button></div>}/>
    <div className="review-kpis"><MetricCard label="Total Tasks" value={reviews.length}/><MetricCard label="Open" value={open}/><MetricCard label="Assigned to me" value={reviews.filter(r=>r.assignee==='Aria').length}/><MetricCard label="Due today" value={dueToday}/><MetricCard label="Overdue" value={overdue}/></div>
    <div className="table-wrap"><table><thead><tr><th><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all"/></th><th>Title</th><th>Team</th><th>Phase</th><th>Priority</th><th>Assignee</th><th>Status</th><th>Due Date</th><th/></tr></thead><tbody>{rows.map(r => <tr key={r.id} className={`review-row${selected.includes(r.id) ? ' selected' : ''}`} onClick={() => onOpen(r)}><td><input type="checkbox" checked={selected.includes(r.id)} aria-label={`Select ${r.title}`} onClick={e=>e.stopPropagation()} onChange={()=>setSelected(s=>s.includes(r.id)?s.filter(id=>id!==r.id):[...s,r.id])}/></td><td><strong>{r.title}</strong>{r.key ? <small className="row-description">{r.key}</small> : null}{r.description && <small className="row-description">{r.description}</small>}</td><td>{r.area}</td><td onClick={e => e.stopPropagation()}><AppSelect value={r.stage} options={STAGES} onChange={val => updateReview(r.id, { stage: val })} ariaLabel="Change phase"/></td><td><Priority value={r.priority}/></td><td onClick={e => e.stopPropagation()}><span className="assignee"><User size={13}/><AppSelect value={r.assignee || ''} options={owners.map(o => ({ value: o, label: o }))} onChange={val => updateReview(r.id, { assignee: val })} ariaLabel="Change assignee"/></span></td><td><StatusPill value={statusFor(r)}/></td><td>{r.due ? slashDate(r.due) : '—'}</td><td><button className="row-action" onClick={e=>{e.stopPropagation(); archiveReview(r.id);}} aria-label="Archive review"><Archive size={16}/></button></td></tr>)}</tbody></table><div className="table-pagination"><span>{selected.length ? `${selected.length} selected` : 'Rows per page'} <b>10 <ChevronDown size={13}/></b></span><span>{from}–{to} of {filtered.length}</span><span className="pagination-arrows"><button className="page-arrow" disabled={safePage===0} onClick={()=>setPageIdx(safePage-1)} aria-label="Previous page"><ChevronLeft size={15}/></button> {safePage + 1} / {pages} <button className="page-arrow" disabled={safePage>=pages-1} onClick={()=>setPageIdx(safePage+1)} aria-label="Next page"><ChevronRight size={15}/></button></span></div></div>
    {selected.length > 0 && <div className="bulk-bar"><strong>{selected.length} selected</strong><button onClick={() => setSelected([])}><X size={15}/> Clear</button><button onClick={archiveSelected}><Archive size={15}/> Archive</button></div>}
  </section>;
}
function ReviewDetail({ review, meetings, user, onClose, onUpdated, onDeleted, onToast, onRemoveRequest }) {
  const [detail,setDetail]=useState(null); const [comment,setComment]=useState(''); const [draft,setDraft]=useState(review);
  useEffect(()=>{api(`/api/reviews/${review.id}/details`).then(d=>{setDetail(d);setDraft(d.review)}).catch(e=>onToast(e.message))},[review.id]);
  const save=async patch=>{try{const saved=await api(`/api/reviews/${review.id}`,{method:'PATCH',body:JSON.stringify(patch)});setDraft(saved);setDetail(d=>({...d,review:saved}));onUpdated(saved);onToast('Task updated')}catch(e){onToast(e.message)}};
  const submitComment=async e=>{e.preventDefault();if(!comment.trim())return;try{const c=await api(`/api/reviews/${review.id}/comments`,{method:'POST',body:JSON.stringify({body:comment})});setDetail(d=>({...d,comments:[...(d.comments||[]),c]}));setComment('');onToast('Comment added')}catch(e){onToast(e.message)}};
  const remove = () => {
    const doDelete = async () => { try { await api(`/api/reviews/${review.id}`, { method: 'DELETE' }); onDeleted(review.id); } catch (e) { onToast(e.message); } };
    if (onRemoveRequest) onRemoveRequest(doDelete);
    else if (confirm('Delete this task permanently?')) doDelete();
  };
  const meetingOptions = [{ value: '', label: 'No related meeting' }, ...meetings.map(m => ({ value: m.id, label: m.title }))];
  return <div className="detail-backdrop" onMouseDown={onClose}><aside className="detail-panel" onMouseDown={e=>e.stopPropagation()}><button className="detail-close" onClick={onClose}><X size={19}/></button><div className="detail-head"><h2>{draft.title}</h2><div className="detail-badges"><StatusPill value={statusFor(draft)}/><Priority value={draft.priority}/><span>{draft.due||'No due date'}</span></div></div><div className="detail-scroll"><DetailSection title="Description"><textarea className="detail-description" value={draft.description||''} onChange={e=>setDraft({...draft,description:e.target.value})} onBlur={e=>save({description:e.target.value})} placeholder="Add a description…"/></DetailSection><DetailSection title="Related meeting">{detail?.meeting?<div className="related-meeting"><Video size={17}/><div><strong>{detail.meeting.title}</strong><small>{dateLabel(detail.meeting.date)}</small></div><ExternalLink size={15}/></div>:<AppSelect value={draft.meetingId||''} options={meetingOptions} onChange={val => save({ meetingId: val })} placeholder="No related meeting" ariaLabel="Related meeting"/>}</DetailSection><DetailSection title="Properties"><div className="detail-grid"><SelectField label="Phase" value={draft.stage} values={STAGES} onChange={v=>save({stage:v})}/><SelectField label="Team" value={draft.area} values={AREAS} onChange={v=>save({area:v})}/><SelectField label="Status" value={statusFor(draft)} values={['Open','In Progress','Review','Resolved','Rejected']} onChange={v=>save({status:v})}/><SelectField label="Priority" value={draft.priority} values={PRIORITIES} onChange={v=>save({priority:v})}/></div></DetailSection><DetailSection title="Ownership"><div className="detail-grid"><label>Assignee<input value={draft.assignee||''} onChange={e=>setDraft({...draft,assignee:e.target.value})} onBlur={e=>save({assignee:e.target.value})}/></label><label>Submitted by<input readOnly value={draft.submittedBy||user.name}/></label></div></DetailSection><DetailSection title="Planning"><label>Due date<input type="date" value={draft.due||''} onChange={e=>save({due:e.target.value})}/></label></DetailSection><DetailSection title="Discussion"><form className="comment-form" onSubmit={submitComment}><MessageCircle size={17}/><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a comment…"/><button className="primary-button" disabled={!comment.trim()}>Comment</button></form>{detail?.comments?.map(c=><div className="comment-list" key={c.id}><div><strong>{c.name}</strong><p>{c.body}</p><small>{relativeDate(c.createdAt)}</small></div></div>)}</DetailSection><DetailSection title="Activity"><div className="detail-activity">{detail?.activity?.map(a=><div key={a.id}><Clock3 size={14}/><p><strong>{a.name||'System'}</strong> {a.action==='created'?'created this task':a.action==='commented'?'commented':`updated ${a.metadata?.fields?.join(', ')||'this task'}`}<small>{relativeDate(a.createdAt)}</small></p></div>)}</div></DetailSection></div><div className="detail-footer"><button onClick={()=>save({archived:1})}><Archive size={15}/> Archive</button><button className="danger-button" onClick={remove}><Trash2 size={15}/> Delete</button></div></aside></div>;
}
function ReviewDetailEnhanced({ review, meetings, metadata = [], sprints = [], user, onClose, onUpdated, onDeleted, onToast, onRemoveRequest }) {
  const [detail, setDetail] = useState(null); const [draft, setDraft] = useState(review); const [comment, setComment] = useState(''); const [subtask, setSubtask] = useState(''); const [uploading, setUploading] = useState(false); const [now, setNow] = useState(Date.now()); const hydrated = useRef(false);
  useEffect(() => {
    let active = true;
    const refresh = () => reviewsApi.details(review.id).then(result => { if (!active) return; setDetail(result); if (!hydrated.current) { setDraft(result.review); hydrated.current = true; } }).catch(error => onToast(error.message));
    refresh();
    const poll = window.setInterval(refresh, 10000); const clock = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { active = false; window.clearInterval(poll); window.clearInterval(clock); };
  }, [review.id]);
  const save = async patch => { try { const saved = await api(`/api/reviews/${review.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); setDraft(saved); setDetail(previous => ({ ...previous, review: saved })); onUpdated(saved); onToast('Task updated'); } catch (error) { onToast(error.message); } };
  const addSubtask = async event => { event.preventDefault(); if (!subtask.trim()) return; try { const saved = await api(`/api/reviews/${review.id}/subtasks`, { method: 'POST', body: JSON.stringify({ title: subtask }) }); setDetail(previous => ({ ...previous, subtasks: [...(previous.subtasks || []), saved] })); setSubtask(''); } catch (error) { onToast(error.message); } };
  const toggleSubtask = async item => { try { const saved = await api(`/api/reviews/${review.id}/subtasks/${item.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !item.completed }) }); setDetail(previous => ({ ...previous, subtasks: previous.subtasks.map(current => current.id === item.id ? { ...current, ...saved } : current) })); } catch (error) { onToast(error.message); } };
  const submitComment = async event => { event.preventDefault(); if (!comment.trim()) return; try { const saved = await api(`/api/reviews/${review.id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) }); setDetail(previous => ({ ...previous, comments: [...(previous.comments || []), saved] })); setComment(''); onToast('Comment added'); } catch (error) { onToast(error.message); } };
  const remove = () => { const action = async () => { try { await api(`/api/reviews/${review.id}`, { method: 'DELETE' }); onDeleted(review.id); } catch (error) { onToast(error.message); } }; onRemoveRequest ? onRemoveRequest(action) : action(); };
  const upload = async event => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); try { const form = new FormData(); form.append('file', file); const response = await fetch(`/api/reviews/${review.id}/attachments`, { method: 'POST', body: form }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setDetail(previous => ({ ...previous, attachments: [result, ...(previous.attachments || [])] })); onToast('Attachment uploaded'); } catch (error) { onToast(error.message); } finally { setUploading(false); event.target.value = ''; } };
  const labels = Array.isArray(draft.labels) ? draft.labels : [];
  const epics = metadata.filter(item => item.type === 'epic').map(item => item.name);
  const features = metadata.filter(item => item.type === 'feature').map(item => item.name);
  const labelOptions = metadata.filter(item => item.type === 'label').map(item => item.name);
  const historyModel = makeHistoryModel(detail?.history, statusFor(draft), draft.createdAt || new Date().toISOString(), now);
  const estimateMinutes = Number(draft.estimateHours || 0) * 60; const overBy = estimateMinutes && historyModel.activeMinutes > estimateMinutes ? historyModel.activeMinutes - estimateMinutes : 0;
  const meetingOptions = [{ value: '', label: 'No related meeting' }, ...meetings.map(item => ({ value: item.id, label: item.title }))];
  return <div className="detail-backdrop" onMouseDown={onClose}><aside className="detail-panel" onMouseDown={event => event.stopPropagation()}><button className="detail-close" onClick={onClose}><X size={19}/></button><div className="detail-head"><input className="detail-title-input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} onBlur={event => save({ title: event.target.value })}/><div className="detail-badges"><StatusPill value={statusFor(draft)}/><Priority value={draft.priority}/><span>{draft.key || 'No key'}</span><span>{draft.due || 'No due date'}</span></div></div><div className="detail-scroll">{!detail && <div className="empty-state"><Wave /> Loading task details…</div>}<DetailSection title="Description"><textarea className="detail-description" value={draft.description || ''} onChange={event => setDraft({ ...draft, description: event.target.value })} onBlur={event => save({ description: event.target.value })} placeholder="Add a description…"/></DetailSection><DetailSection title="Related meeting">{detail?.meeting ? <div className="related-meeting"><Video size={17}/><div><strong>{detail.meeting.title}</strong><small>{dateLabel(detail.meeting.date)}</small></div><ExternalLink size={15}/></div> : <AppSelect value={draft.meetingId || ''} options={meetingOptions} onChange={val => save({ meetingId: val })} placeholder="No related meeting" ariaLabel="Related meeting"/>}</DetailSection><DetailSection title="Properties"><div className="detail-grid"><SelectField label="Phase" value={draft.stage} values={STAGES} onChange={value => save({ stage: value })}/><SelectField label="Team" value={draft.area} values={AREAS} onChange={value => save({ area: value })}/><SelectField label="Status" value={statusFor(draft)} values={['Open','In Progress','Review','Resolved','Rejected']} onChange={value => save({ status: value })}/><SelectField label="Priority" value={draft.priority} values={PRIORITIES} onChange={value => save({ priority: value })}/><label>Epic<input value={draft.epic || ''} onChange={event => setDraft({ ...draft, epic: event.target.value })} onBlur={event => save({ epic: event.target.value })}/></label><label>Feature<input value={draft.feature || ''} onChange={event => setDraft({ ...draft, feature: event.target.value })} onBlur={event => save({ feature: event.target.value })}/></label><label>Sprint<input value={draft.sprint || ''} onChange={event => setDraft({ ...draft, sprint: event.target.value })} onBlur={event => save({ sprint: event.target.value })}/></label><label>Estimate (hours)<input type="number" min="0" step="0.5" value={draft.estimateHours ?? ''} onChange={event => setDraft({ ...draft, estimateHours: event.target.value })} onBlur={event => save({ estimateHours: event.target.value })}/></label><label className="detail-wide">Labels<input value={labels.join(', ')} onChange={event => setDraft({ ...draft, labels: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} onBlur={event => save({ labels: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })}/></label></div></DetailSection><DetailSection title="Ownership"><div className="detail-grid"><label>Assignee<input value={draft.assignee || ''} onChange={event => setDraft({ ...draft, assignee: event.target.value })} onBlur={event => save({ assignee: event.target.value })} placeholder="Aria, Leo"/></label><label>Reporter<input value={draft.reporter || draft.submittedBy || user.name} onChange={event => setDraft({ ...draft, reporter: event.target.value })} onBlur={event => save({ reporter: event.target.value })}/></label><label>Submitted by<input readOnly value={draft.submittedBy || user.name}/></label></div></DetailSection><DetailSection title="Planning"><div className="detail-grid"><label>Start date<input type="date" value={draft.startDate || ''} onChange={event => save({ startDate: event.target.value })}/></label><label>Due date<input type="date" value={draft.due || ''} onChange={event => save({ due: event.target.value })}/></label></div></DetailSection><DetailSection title="Subtasks"><div className="subtask-list">{detail?.subtasks?.map(item => <label key={item.id} className="subtask-row"><input type="checkbox" checked={item.completed} onChange={() => toggleSubtask(item)}/><span className={item.completed ? 'completed' : ''}>{item.title}</span></label>)}</div><form className="subtask-form" onSubmit={addSubtask}><Plus size={15}/><input value={subtask} onChange={event => setSubtask(event.target.value)} placeholder="Add subtask…"/><button disabled={!subtask.trim()}>Add</button></form></DetailSection><DetailSection title="Discussion"><form className="comment-form" onSubmit={submitComment}><MessageCircle size={17}/><input value={comment} onChange={event => setComment(event.target.value)} placeholder="Add a comment…"/><button className="primary-button" disabled={!comment.trim()}>Comment</button></form>{detail?.comments?.map(item => <div className="comment-list" key={item.id}><strong>{item.name}</strong><p>{item.body}</p><small>{relativeDate(item.createdAt)}</small></div>)}</DetailSection><DetailSection title="Status history"><div className="history-heading"><strong>Status History ({historyModel.timeline.length} changes)</strong><span>Live</span></div><div className="history-chips">{Object.entries(historyModel.totals).map(([name, minutes]) => <span key={name}><i className={`history-dot ${name.toLowerCase().replace(/\s+/g, '-')}`}/>{name} <small>{elapsedLabel(minutes)}</small></span>)}</div><div className={`active-time-banner${overBy ? ' over' : ''}`}><Clock3 size={18}/><span><strong>Active time:</strong> {elapsedLabel(historyModel.activeMinutes)}{overBy ? ` (+${elapsedLabel(overBy)} over estimate)` : ''}</span></div><div className="status-timeline">{historyModel.timeline.map(item => <div className="status-event" key={item.id}><i className={`history-dot ${String(item.toStatus).toLowerCase().replace(/\s+/g, '-')}`}/><div><p><span className="history-badge">{item.from}</span><ArrowRight size={14}/><span className="history-badge">{item.toStatus}</span></p><small>by {item.name || 'System'} · {historyDateLabel(item.createdAt)}</small><em>spent {item.spent} in {item.toStatus}</em></div></div>)}</div></DetailSection><DetailSection title="Activity & comments"><div className="detail-activity">{detail?.activity?.map(item => <div key={item.id}><Clock3 size={14}/><p><strong>{item.name || 'System'}</strong> {item.action === 'created' ? 'created this task' : item.action === 'commented' ? 'commented' : item.action === 'subtask_added' ? 'added a subtask' : `updated ${item.metadata?.fields?.join(', ') || 'this task'}`}<small>{relativeDate(item.createdAt)}</small></p></div>)}</div></DetailSection></div><div className="detail-footer"><button onClick={() => save({ archived: 1 })}><Archive size={15}/> Archive</button><button className="danger-button" onClick={remove}><Trash2 size={15}/> Delete</button></div></aside></div>;
}
function DetailSection({title,children}){return <section className="detail-section"><h3>{title}</h3>{children}</section>}
function MetricCard({ label, value }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function Priority({ value }) { return <span className={`priority ${value.toLowerCase()}`}><i/>{value}</span>; }
function PageHeading({ eyebrow, title, description, action }) { return <div className="page-heading"><div>{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }

function DatePicker({ value, onPick, onClear }) {
  const initial = value ? new Date(`${value}T12:00:00`) : new Date();
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() });
  const move = delta => setView(v => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(view.y, view.m, 1));
  const offset = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const daysInPrev = new Date(view.y, view.m, 0).getDate();
  const cells = [];
  for (let i = offset - 1; i >= 0; i--) cells.push({ d: daysInPrev - i, other: true, key: `p${i}` });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, key: `c${d}` });
  let n = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ d: n, other: true, key: `n${n++}` });
  const isoOf = day => `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return <div className="date-picker"><div className="date-picker-head"><strong>{monthLabel}</strong><div>{value && <button className="date-clear-text" onClick={onClear}>Clear</button>}<button className="date-nav" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={16}/></button><button className="date-nav" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={16}/></button></div></div><div className="date-grid date-week">{['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(w => <span key={w}>{w}</span>)}</div><div className="date-grid">{cells.map(c => <button key={c.key} disabled={c.other} className={`date-cell${c.other ? ' other' : ''}${!c.other && isoOf(c.d) === value ? ' picked' : ''}`} onClick={() => onPick(isoOf(c.d))}>{c.d}</button>)}</div></div>;
}

function Meetings({ meetings, reviews = [], addMeeting, addReview, onDeleteMeeting, setToast, setModal, onNewMeeting, onTasksCreated, onOpen }) {
  const [selected, setSelected] = useState(meetings[0]?.id);
  const [dateFilter, setDateFilter] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const meeting = meetings.find(m => m.id === selected) || meetings[0];
  const [drafts, setDrafts] = useState([]);
  useEffect(() => setDrafts(meeting ? extractNotes(meeting.notes) : []), [meeting?.id]);
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
        {groups.length ? groups.map(([date, items]) => <div key={date} className="meeting-group"><p className="meeting-group-label">{groupDateLabel(date)} · {items.length} meeting{items.length === 1 ? '' : 's'}</p>{items.map(m => <article key={m.id} className={`meeting-card${m.id === meeting?.id ? ' selected' : ''}`} onClick={() => setSelected(m.id)}><div><strong>{m.title}</strong><p><CalendarDays size={12}/> {dateLabel(m.date)}{m.ai && <span className="ai-badge"><Sparkles size={11}/> AI</span>}</p></div><div className="meeting-card-actions"><button onClick={e => { e.stopPropagation(); onDeleteMeeting(m.id); }} aria-label={`Delete ${m.title}`}><Trash2 size={15}/></button></div></article>)}</div>) : <Empty text="No meetings found."/>}
      </div>
      {meeting && <aside className="meeting-detail-card">
        <div className="meeting-detail-body"><h2>{meeting.title}</h2><p className="meeting-detail-date"><CalendarDays size={13}/> {groupDateLabel(meeting.date)}</p><p className="detail-label">MEETING NOTES</p>{noteLines.length ? <ul className="notes-lines">{noteLines.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p className="notes-empty">No notes yet.</p>}</div>
        <div className="meeting-actions"><div className="meeting-actions-head"><h3>Action items</h3><span>{reviews.filter(item => item.meetingId === meeting.id).length + drafts.length} item{reviews.filter(item => item.meetingId === meeting.id).length + drafts.length === 1 ? '' : 's'}</span><button className="add-task-btn" disabled={!drafts.length} onClick={createDrafts}><Plus size={14}/> Add task</button></div>{drafts.length ? <div className="draft-list">{drafts.map((d, i) => <div key={`${d}-${i}`}><CheckCircle2 size={18}/><input value={d} onChange={e=>setDrafts(a=>a.map((x,n)=>n===i?e.target.value:x))}/><button onClick={()=>setDrafts(a=>a.filter((_,n)=>n!==i))}><X size={16}/></button></div>)}</div> : <div className="draft-empty"><span className="draft-empty-icon"><Sparkles size={17}/></span><strong>No action items yet</strong><p>Write clear action lines in the notes above to generate drafts.</p></div>}{reviews.filter(item => item.meetingId === meeting.id).map(item => <button className="linked-action-item" key={item.id} onClick={() => onOpen && onOpen(item)}><strong>{item.title}</strong><span>{item.priority} · {statusFor(item)}{item.due ? ` · ${shortDate(item.due)}` : ''}</span></button>)}</div>
      </aside>}
    </div></section>;
}
function extractNotes(notes) { return notes.split(/[\n.]+/).map(s=>s.replace(/^\s*(?:[-•*]\s*)?/, '').trim()).filter(s=>s.length>4).slice(0,6); }

const RAG_META = {
  'On Track': { color: REPORT_COLORS.success, Icon: CheckCircle2 },
  'At Risk': { color: REPORT_COLORS.warning, Icon: TriangleAlert },
  Delayed: { color: REPORT_COLORS.danger, Icon: XCircle }
};
function RagPill({ value }) {
  const meta = RAG_META[value] || RAG_META['On Track'];
  const Icon = meta.Icon;
  return <span className={`rag ${value.toLowerCase().replace(' ', '-')}`}><Icon size={14}/> {value}</span>;
}
function Donut({ segments, size = 150, thickness = 26 }) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - thickness) / 2;
  const circle = 2 * Math.PI * radius;
  let acc = 0;
  return <svg className="donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution chart">
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef1f5" strokeWidth={thickness} />
    {segments.map((item, index) => {
      if (!total || !item.value) return null;
      const frac = item.value / total;
      const el = <circle key={index} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={item.color} strokeWidth={thickness} strokeDasharray={`${frac * circle} ${circle}`} strokeDashoffset={-acc * circle} strokeLinecap="butt" transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
      acc += frac;
      return el;
    })}
  </svg>;
}
function BurndownChart({ days }) {
  const width = 720; const height = 250; const padL = 36; const padR = 10; const padT = 12; const padB = 26;
  const maxY = Math.max(1, ...days.map(d => Math.max(d.remaining, d.ideal)));
  const x = i => padL + (days.length > 1 ? i / (days.length - 1) : 0.5) * (width - padL - padR);
  const y = v => padT + (1 - v / maxY) * (height - padT - padB);
  const line = points => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round(maxY / 2), Math.ceil(maxY)];
  const labelIdx = days.length > 4 ? [0, Math.floor(days.length / 3), Math.floor(days.length * 2 / 3), days.length - 1] : days.map((_, i) => i);
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sprint burndown">
    {ticks.map(t => <g key={t}><line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="#eef1f5" /><text x={padL - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
    {labelIdx.map(i => <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{days[i].date.slice(5)}</text>)}
    <path d={line(days.map(d => d.ideal))} fill="none" stroke={REPORT_COLORS.muted} strokeWidth="1.5" strokeDasharray="5 4" />
    <path d={line(days.map(d => d.remaining))} fill="none" stroke={REPORT_COLORS.accent} strokeWidth="2" />
    {days.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.remaining)} r="3" fill="#fff" stroke={REPORT_COLORS.accent} strokeWidth="2" />)}
  </svg>;
}
function CfdChart({ points }) {
  const width = 720; const height = 240; const padL = 32; const padR = 10; const padT = 12; const padB = 26;
  const maxY = Math.max(1, ...points.map(p => p.done + p.active + p.todo));
  const x = i => padL + (points.length > 1 ? i / (points.length - 1) : 0.5) * (width - padL - padR);
  const y = v => padT + (1 - v / maxY) * (height - padT - padB);
  const area = (low, high) => {
    const top = high.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const bottom = low.map((v, i) => `L${x(points.length - 1 - i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `${top} ${bottom} Z`;
  };
  const done = points.map(p => p.done);
  const active = points.map(p => p.done + p.active);
  const todo = points.map(p => p.done + p.active + p.todo);
  const zeros = points.map(() => 0);
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative flow">
    {[0, Math.round(maxY / 2), Math.ceil(maxY)].map(t => <g key={t}><line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="#eef1f5" /><text x={padL - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
    {points.map((p, i) => <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{p.label}</text>)}
    <path d={area(active, todo)} fill={REPORT_COLORS.muted} opacity="0.55" />
    <path d={area(done, active)} fill={REPORT_COLORS.accentSoft} opacity="0.7" />
    <path d={area(zeros, done)} fill={REPORT_COLORS.success} opacity="0.6" />
  </svg>;
}
function Reports({ reviews, projects, sprints, projectName, onRefresh, onOpen }) {
  const [tab, setTab] = useState('portfolio');
  const [projectId, setProjectId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [burnId, setBurnId] = useState('');
  const [burn, setBurn] = useState(null);
  const [burnLoading, setBurnLoading] = useState(false);
  const [expandedSprint, setExpandedSprint] = useState(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const tabs = [
    { id: 'portfolio', label: 'Portfolio & PMO', desc: 'Cross-project health, RAG status, portfolio overview' },
    { id: 'scrum', label: 'Scrum & Agile', desc: 'Sprint reports, velocity, burndown, CFD' },
    { id: 'tasks', label: 'Tasks & Team', desc: 'Task status, priority, workload, overdue' }
  ];
  const portfolio = useMemo(() => portfolioProjects(reviews, projects, projectName, today), [reviews, projects, projectName]);
  const overview = useMemo(() => taskOverview(reviews, today), [reviews]);
  const projectList = projects && projects.length ? projects : [{ id: 'default', name: projectName }];
  const effectiveProjectId = projectId || projectList[0].id;
  const scopedProject = pid => (r => (r.projectId || 'default') === pid);
  const projectReviews = useMemo(() => activeReviews(reviews).filter(scopedProject(effectiveProjectId)), [reviews, effectiveProjectId]);
  const owners = useMemo(() => [...new Set(projectReviews.map(r => r.assignee).filter(Boolean))], [projectReviews]);
  const teamReviews = useMemo(() => assignee ? projectReviews.filter(r => r.assignee === assignee) : projectReviews, [projectReviews, assignee]);
  const projectSprints = useMemo(() => {
    const direct = sprints.filter(s => (s.projectId || 'default') === effectiveProjectId);
    return direct.length || projectList.length > 1 ? direct : sprints;
  }, [sprints, effectiveProjectId, projectList.length]);
  const burnSprintId = burnId || (projectSprints.find(s => s.status === 'active') || projectSprints[0] || {}).id || '';
  useEffect(() => {
    if (!burnSprintId) { setBurn(null); return; }
    let cancelled = false;
    setBurnLoading(true);
    reportsApi.burndown(burnSprintId).then(data => { if (!cancelled) { setBurn(data); setBurnLoading(false); } }).catch(() => { if (!cancelled) setBurnLoading(false); });
    return () => { cancelled = true; };
  }, [burnSprintId]);
  const velocity = useMemo(() => projectSprints.map(sprint => ({ sprint, ...sprintStats(teamReviews, sprint, today) })), [projectSprints, teamReviews]);
  const cfd = useMemo(() => projectSprints.map(sprint => {
    const items = sprintTasks(teamReviews, sprint);
    const done = items.filter(isResolved).length;
    const active = items.filter(r => !isResolved(r) && (r.stage === 'In Progress' || r.stage === 'Review')).length;
    return { label: sprint.name, done, active, todo: items.length - done - active };
  }), [projectSprints, teamReviews]);
  const statusData = useMemo(() => statusCounts(teamReviews), [teamReviews]);
  const priorityData = useMemo(() => priorityCounts(teamReviews), [teamReviews]);
  const workloadRows = useMemo(() => teamWorkload(teamReviews), [teamReviews]);
  const hours = useMemo(() => hoursTotals(teamReviews), [teamReviews]);
  const taskRows = useMemo(() => {
    const rows = [...teamReviews].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    return overdueOnly ? rows.filter(r => r.due && r.due < today && !isResolved(r)) : rows;
  }, [teamReviews, overdueOnly, today]);
  const ragCounts = { 'On Track': 0, 'At Risk': 0, Delayed: 0 };
  portfolio.forEach(p => { ragCounts[p.status] += 1; });
  const activeTab = tabs.find(t => t.id === tab);

  const reportProjectOptions = projectList.map(p => ({ value: p.id, label: p.name }));
  const reportAssigneeOptions = [{ value: '', label: 'Semua User' }, ...owners.map(o => ({ value: o, label: o }))];
  const reportBurnOptions = projectSprints.map(s => ({ value: s.id, label: s.name }));

  return <section className="page reports-page">
    <PageHeading title="Reports" description={activeTab.desc} action={<button className="ghost-button" onClick={onRefresh}><RotateCcw size={15}/> Refresh</button>} />
    <div className="report-tabs">{tabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
    {tab === 'portfolio' && <>
      <div className="review-kpis report-kpis"><MetricCard label="Total Projects" value={portfolio.length}/><MetricCard label="On Track" value={ragCounts['On Track']}/><MetricCard label="At Risk" value={ragCounts['At Risk']}/><MetricCard label="Delayed" value={ragCounts.Delayed}/></div>
      <div className="report-grid-2">
        <div className="rail-card"><h2>Projects by Status</h2><div className="donut-wrap"><Donut segments={[{ value: ragCounts['At Risk'], color: REPORT_COLORS.warning }, { value: ragCounts['On Track'], color: REPORT_COLORS.success }, { value: ragCounts.Delayed, color: REPORT_COLORS.danger }]} /><div className="donut-legend"><span><i style={{ background: REPORT_COLORS.warning }}/>At Risk</span><span><i style={{ background: REPORT_COLORS.success }}/>On Track</span>{ragCounts.Delayed > 0 && <span><i style={{ background: REPORT_COLORS.danger }}/>Delayed</span>}</div></div></div>
        <div className="rail-card"><h2>Task Overview</h2><div className="report-progress-head"><span>Overall Progress</span><span>{Math.round(overview.progress * 1000) / 10}%</span></div><div className="progress report-progress"><span style={{ width: `${overview.progress * 100}%` }}/></div><div className="report-stats"><div><ListChecks size={20}/><strong>{overview.total}</strong><span>Total Tasks</span></div><div><TrendUp size={20}/><strong>{overview.done}</strong><span>Completed</span></div><div><Clock size={20}/><strong>{overview.overdue}</strong><span>Overdue</span></div></div></div>
      </div>
      <div className="rail-card report-table-card"><h2><Lightning size={17}/> Project Health Report</h2><div className="table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th>Tasks</th><th>Done</th><th>Overdue</th><th>Progress</th><th>Active Sprint</th><th>Reason</th></tr></thead><tbody>{portfolio.map(p => {
        const pct = Math.round(p.progress * 100);
        const activeSprint = sprints.find(s => (s.projectId || 'default') === p.id && s.status === 'active');
        return <tr key={p.id}><td><span className="project-cell"><span className="avatar report-avatar">{p.name.slice(0, 2).toUpperCase()}</span><strong>{p.name}</strong></span></td><td><RagPill value={p.status}/></td><td>{p.tasks}</td><td className="num-done">{p.done}</td><td className={p.overdue ? 'num-overdue' : ''}>{p.overdue}</td><td><span className="health-progress"><span className="progress"><span style={{ width: `${pct}%` }}/></span>{pct}%</span></td><td>{activeSprint ? activeSprint.name : '—'}</td><td>{p.tasks === 0 ? 'No tasks yet' : p.overdue > 0 ? `Only ${pct}% complete` : `${pct}% complete`}</td></tr>;
      })}</tbody></table></div></div>
    </>}
    {tab === 'scrum' && <>
      <div className="report-filters">
        <label>Select Project: <AppSelect value={effectiveProjectId} options={reportProjectOptions} onChange={setProjectId} ariaLabel="Select Project"/></label>
        <label>Filter Assignee: <AppSelect value={assignee} options={reportAssigneeOptions} onChange={setAssignee} ariaLabel="Filter Assignee"/></label>
      </div>
      <div className="report-grid-2">
        <div className="rail-card"><h2><TrendUp size={17}/> Velocity Report</h2><p>Estimated vs completed hours per sprint</p><VelocityBars stats={velocity} /></div>
        <div className="rail-card"><h2><TrendUp size={17}/> Cumulative Flow Diagram</h2><p>Task distribution per sprint (current snapshot)</p>{cfd.length ? <><CfdChart points={cfd} /><div className="chart-legend"><span><i style={{ background: REPORT_COLORS.success }}/>Done</span><span><i style={{ background: REPORT_COLORS.accent }}/>In Progress</span><span><i style={{ background: REPORT_COLORS.muted }}/>To Do</span></div></> : <Empty text="No sprints yet." />}</div>
      </div>
      <div className="report-filters">
        <label>Burndown for: <AppSelect value={burnSprintId} options={reportBurnOptions} onChange={setBurnId} ariaLabel="Burndown Sprint"/></label>
      </div>
      <div className="rail-card"><h2><TrendUp size={17}/> Sprint Burndown — {burn?.sprint?.name || ''}</h2><p>Remaining tasks per day vs ideal progress</p>{burnLoading ? <div className="empty-state"><Wave /> Loading burndown…</div> : burn && burn.total ? <><BurndownChart days={burn.days} /><div className="chart-legend"><span><i style={{ background: REPORT_COLORS.muted }}/>Ideal</span><span><i style={{ background: REPORT_COLORS.accent }}/>Remaining</span></div></> : <Empty text="No burndown data for this sprint." />}</div>
      <div className="report-section-head"><h2><Clock size={17}/> Sprint Reports ({projectSprints.length} sprints)</h2></div>
      {projectSprints.map(sprint => {
        const stats = sprintStats(teamReviews, sprint, today);
        const pct = stats.total ? Math.round(stats.done / stats.total * 100) : 0;
        const open = expandedSprint === sprint.id;
        const items = open ? sprintTasks(teamReviews, sprint) : [];
        return <div className="rail-card sprint-row" key={sprint.id}><button className="sprint-row-head" onClick={() => setExpandedSprint(open ? null : sprint.id)}><ChevronDown size={16} className={open ? 'open' : ''}/><div><strong>{sprint.name}</strong><StatusPill value={sprint.status === 'active' ? 'In Progress' : sprint.status === 'completed' ? 'Resolved' : 'Open'}/><small>{sprint.startDate || '—'} → {sprint.endDate || '—'} · {stats.done}/{stats.total} tasks</small></div><div className="sprint-row-stats"><span>Estimate<strong>{formatHours(stats.est)}</strong></span><span className="progress"><span style={{ width: `${pct}%` }}/></span><span>{pct}%</span></div></button>{open && <div className="sprint-row-tasks">{items.length ? items.map(r => <button key={r.id} onClick={() => onOpen(r)}><span className="dot"/><span><strong>{r.key ? `${r.key} ` : ''}{r.title}</strong><small>{r.area} · {statusFor(r)}</small></span><ArrowRight size={15}/></button>) : <p>No tasks in this sprint.</p>}</div>}</div>;
      })}
    </>}
    {tab === 'tasks' && <>
      <div className="review-kpis report-kpis"><MetricCard label="Total Tasks" value={teamReviews.length}/><MetricCard label="Overdue" value={teamReviews.filter(r => r.due && r.due < today && !isResolved(r)).length}/><MetricCard label="Est. Hours" value={formatHours(hours.est)}/><MetricCard label="Resolved" value={teamReviews.filter(isResolved).length}/></div>
      <div className="report-grid-2">
        <div className="rail-card"><h2><ChartPieSlice size={17}/> Task Status Report</h2><p>Distribution of tasks by status</p><div className="donut-split"><Donut size={130} segments={statusData.map((s, i) => ({ value: s.count, color: [REPORT_COLORS.accent, REPORT_COLORS.info, REPORT_COLORS.warning, REPORT_COLORS.muted, REPORT_COLORS.success, REPORT_COLORS.danger][i % 6] }))} /><div className="donut-legend counts">{statusData.map((s, i) => <span key={s.stage}><i style={{ background: [REPORT_COLORS.accent, REPORT_COLORS.info, REPORT_COLORS.warning, REPORT_COLORS.muted, REPORT_COLORS.success, REPORT_COLORS.danger][i % 6] }}/>{s.stage}<b>{s.count}</b></span>)}</div></div></div>
        <div className="rail-card"><h2><TriangleAlert size={17}/> Priority Distribution</h2><p>Tasks per priority level</p><div className="priority-bars">{priorityData.map(p => { const max = Math.max(1, ...priorityData.map(x => x.count)); const color = p.priority === 'Blocker' ? REPORT_COLORS.danger : p.priority === 'Major' ? REPORT_COLORS.warning : REPORT_COLORS.muted; return <div className="wl-row" key={p.priority}><span className="wl-name">{p.priority}</span><div className="wl-bar"><i style={{ width: `${p.count / max * 100}%`, background: color }}/></div><span className="wl-count">{p.count}</span></div>; })}</div></div>
      </div>
      <div className="rail-card"><h2><Users size={16}/> Team Workload</h2><p>Task count + estimated hours per person</p><div className="team-rows">{workloadRows.map(w => <div className="team-row-full" key={w.name}><span className="avatar">{w.name.slice(0, 2).toUpperCase()}</span><div><strong>{w.name}</strong><small>Est: {formatHours(w.est)}</small></div><span>{w.tasks} tasks</span></div>)}</div></div>
      <div className="rail-card report-table-card"><div className="report-table-head"><h2><ListChecks size={17}/> Task List ({taskRows.length} tasks)</h2><label className="overdue-toggle"><input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)}/> Show overdue only</label></div><div className="table-wrap"><table><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due Date</th><th>Estimate</th></tr></thead><tbody>{taskRows.map(r => <tr key={r.id}><td><small className="row-description">{r.key || ''}</small><strong>{r.title}</strong></td><td><StatusPill value={statusFor(r)}/></td><td><Priority value={r.priority}/></td><td>{r.assignee || '—'}</td><td className={r.due && r.due < today && !isResolved(r) ? 'num-overdue' : ''}>{r.due ? slashDate(r.due) : '—'}</td><td>{r.estimateHours != null ? formatHours(r.estimateHours) : '—'}</td></tr>)}</tbody></table></div></div>
    </>}
  </section>;
}
function VelocityBars({ stats }) {
  const max = Math.max(1, ...stats.flatMap(s => [s.est, s.doneEst]));
  const ticks = [max, max / 2, 0];
  return <div className="velocity"><div className="velocity-plot"><div className="velocity-axis">{ticks.map(t => <span key={t}>{Math.round(t)}h</span>)}</div>{stats.length ? stats.map(s => <div className="velocity-group" key={s.sprint.id}><div className="velocity-bars"><span style={{ height: `${s.est / max * 100}%`, background: REPORT_COLORS.accent }} title={`Estimated ${formatHours(s.est)}`}/><span style={{ height: `${s.doneEst / max * 100}%`, background: REPORT_COLORS.success }} title={`Completed ${formatHours(s.doneEst)}`}/></div><small>{s.sprint.name}</small></div>) : <p>No sprint data.</p>}</div><div className="chart-legend"><span><i style={{ background: REPORT_COLORS.accent }}/>Estimated</span><span><i style={{ background: REPORT_COLORS.success }}/>Completed</span></div></div>;
}

function ArchivePage({ reviews, restoreReview }) { return <section className="page"><PageHeading eyebrow="PROJECT TRACKER" title="Archive" description="Resolved or paused items stay here without disappearing."/>{reviews.length ? <div className="archive-list">{reviews.map(r=><article key={r.id}><div><Priority value={r.priority}/><h3>{r.title}</h3><p>{r.area} · Archived item</p></div><button className="text-button" onClick={()=>restoreReview(r.id)}>Restore <ArrowRight size={15}/></button></article>)}</div> : <Empty text="Your archive is empty."/>}</section>; }

function SettingsPageEnhanced({ project, user, saveProject, setToast, onDeleteProject }) {
  const [form, setForm] = useState({ name: project.name, description: project.description || '', accessMode: project.accessMode || 'link' });
  useEffect(() => setForm({ name: project.name, description: project.description || '', accessMode: project.accessMode || 'link' }), [project.name, project.description, project.accessMode]);
  const shareLink = `${window.location.origin}/?project=${project.id || 'default'}`;
  return <section className="page settings-page"><PageHeading title="Settings"/><div className="settings-card"><section><div className="settings-section-head"><span><Settings2 size={20}/></span><div><h2>General</h2><p>Manage your project details.</p></div></div><label>Project name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label>Description<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Optional project description" rows="4"/></label></section><section><div className="settings-section-head"><span><Users size={20}/></span><div><h2>Sharing & access</h2><p>Control who can view this project.</p></div></div><button className={form.accessMode === 'invite' ? 'access-option selected' : 'access-option'} onClick={() => setForm({ ...form, accessMode: 'invite' })}><Lock size={18}/><span><strong>Invite only</strong><small>Only people you invite by email can access this project.</small></span></button><button className={form.accessMode === 'link' ? 'access-option selected' : 'access-option'} onClick={() => setForm({ ...form, accessMode: 'link' })}><Link2 size={18}/><span><strong>Anyone with the link</strong><small>Anyone who has the link can view this project in read-only mode.</small></span></button>{form.accessMode === 'link' && <div className="share-link"><Eye size={15}/><input readOnly value={shareLink}/><button onClick={() => { navigator.clipboard?.writeText(shareLink); setToast('Project link copied'); }}>Copy</button></div>}<button className="primary-button settings-save" disabled={!['super_admin','admin'].includes(user.role)} onClick={() => saveProject(form)}>Save</button></section><section className="danger-section"><div className="settings-section-head"><span><TriangleAlert size={20}/></span><div><h2 className="danger-title">Danger zone</h2><p>Permanently delete this project and all associated feedback.</p></div></div><button className="danger-button" disabled={project.id === 'default' || !['super_admin','admin'].includes(user.role)} onClick={onDeleteProject}><Trash2 size={15}/> {project.id === 'default' ? 'Default project is protected' : 'Delete project'}</button></section></div></section>;
}

function SettingsPage({ project, setToast }) {
  const [name, setName] = useState(project.name);
  const [access, setAccess] = useState('link');
  const makeToken = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const [shareToken, setShareToken] = useState(() => makeToken());
  const pickAccess = value => { setAccess(value); if (value === 'link' && !shareToken) setShareToken(makeToken()); };
  const shareUrl = `${window.location.origin}/share/${shareToken || '…'}`;
  return <section className="page settings-page"><PageHeading title="Settings"/><div className="settings-card"><section><div className="settings-section-head"><span><Settings2 size={20}/></span><div><h2>General</h2><p>Manage your project details.</p></div></div><label>Project name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Description<textarea placeholder="Optional project description" rows="4"/></label></section><section><div className="settings-section-head"><span><Users size={20}/></span><div><h2>Sharing & access</h2><p>Control who can view this project.</p></div></div><button className={access === 'invite' ? 'access-option selected' : 'access-option'} onClick={()=>pickAccess('invite')}><span className="access-icon"><Lock size={18}/></span><span><strong>Invite only</strong><small>Only people you invite by email can access this project.</small></span></button><button className={access === 'link' ? 'access-option selected' : 'access-option'} onClick={()=>pickAccess('link')}><span className="access-icon"><Link2 size={18}/></span><span><strong>Anyone with the link</strong><small>Anyone who has the link can view (read-only). No invite needed.</small></span></button>{access === 'link' && <div className="share-link"><Eye size={15}/><input readOnly value={shareUrl}/><button className="regenerate-btn" onClick={()=>{setShareToken(makeToken());setToast('New share link generated');}} aria-label="Regenerate share link" title="Regenerate link"><RotateCcw size={14}/></button><button onClick={()=>{navigator.clipboard?.writeText(shareUrl);setToast('Project link copied');}}><Copy size={14}/> Copy</button></div>}<button className="primary-button settings-save" onClick={()=>setToast('Settings saved')}>Save</button></section><section className="danger-section"><div className="settings-section-head"><span><TriangleAlert size={20}/></span><div><h2 className="danger-title">Danger zone</h2><p>Permanently delete this project and all associated feedback.</p></div></div><button className="danger-button" onClick={()=>setToast('Project deletion is disabled in this workspace')}><Trash2 size={15}/> Delete project</button></section></div></section>;
}

function AdminPageEnhanced({ user, setToast }) {
  const [admins, setAdmins] = useState([]); const [error, setError] = useState(''); const [loaded, setLoaded] = useState(false); const [inviteOpen, setInviteOpen] = useState(false); const [invite, setInvite] = useState({ name: '', email: '', password: '' });
  const load = () => api('/api/admin/users').then(result => setAdmins(result.users)).catch(error => setError(error.message)).finally(() => setLoaded(true)); useEffect(load, []);
  const submit = async event => { event.preventDefault(); try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify(invite) }); setInviteOpen(false); setInvite({ name: '', email: '', password: '' }); await load(); setToast('Admin account created'); } catch (error) { setToast(error.message); } };
  const role = async (person, nextRole) => { try { await api(`/api/admin/users/${person.id}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }); await load(); setToast('Admin role updated'); } catch (error) { setToast(error.message); } };
  const remove = async person => { if (!confirm(`Delete ${person.email}?`)) return; try { await api(`/api/admin/users/${person.id}`, { method: 'DELETE' }); await load(); setToast('Admin removed'); } catch (error) { setToast(error.message); } };
  const superAdmins = admins.filter(person => person.role === 'super_admin').length; const regularAdmins = admins.filter(person => person.role === 'admin').length;
  return <section className="page admin-page"><PageHeading title="Admin Management" action={<button className="primary-button" onClick={() => setInviteOpen(true)}><Users size={16}/> Invite Admin</button>}/><div className="admin-kpis"><MetricCard label="Total Admins" value={admins.length}/><MetricCard label="Super Admins" value={superAdmins}/><MetricCard label="Regular Admins" value={regularAdmins}/></div>{!loaded ? <div className="empty-state"><Wave /> Loading admins…</div> : error ? <Empty text={error}/> : <div className="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Actions</th></tr></thead><tbody>{admins.map(person => <tr key={person.id}><td><strong>{person.email}{person.id === user.id && <small className="you">(You)</small>}</strong></td><td>{person.name}</td><td><StatusPill value={person.role === 'super_admin' ? 'Super admin' : person.role === 'admin' ? 'Admin' : 'Member'}/></td><td>{person.id !== user.id && <div className="admin-actions"><button onClick={() => role(person, person.role === 'admin' ? 'member' : 'admin')}>{person.role === 'admin' ? 'Demote' : 'Promote'}</button><button className="danger-text" onClick={() => remove(person)}>Delete</button></div>}</td></tr>)}</tbody></table></div>}{inviteOpen && <Modal title="Invite admin" subtitle="Create an admin account that can manage this workspace." onClose={() => setInviteOpen(false)}><form onSubmit={submit}><label>Name<input value={invite.name} onChange={event => setInvite({ ...invite, name: event.target.value })} required/></label><label>Email<input type="email" value={invite.email} onChange={event => setInvite({ ...invite, email: event.target.value })} required/></label><label>Temporary password<input type="password" minLength="10" value={invite.password} onChange={event => setInvite({ ...invite, password: event.target.value })} required/></label><div className="modal-actions"><button type="button" className="text-button" onClick={() => setInviteOpen(false)}>Cancel</button><button className="primary-button">Create admin</button></div></form></Modal>}</section>;
}

function AdminPage({ user }) {
  const [admins, setAdmins] = useState([]); const [error, setError] = useState('');
  useEffect(() => { api('/api/admin/users').then(data => setAdmins(data.users)).catch(err => setError(err.message)); }, []);
  const superAdmins = admins.filter(person => person.role === 'super_admin').length;
  const regularAdmins = admins.filter(person => person.role === 'admin').length;
  return <section className="page admin-page"><PageHeading title="Admin Management" action={<button className="primary-button" onClick={()=>alert('Invite links require an email provider connection. Add Cloudflare Email or Resend before enabling invitations.')}><Users size={16}/> Invite Admin</button>}/><div className="admin-kpis"><MetricCard label="Total Admins" value={admins.length}/><MetricCard label="Super Admins" value={superAdmins}/><MetricCard label="Regular Admins" value={regularAdmins}/></div>{error ? <Empty text={error}/> : <div className="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Actions</th></tr></thead><tbody>{admins.map(person => <tr key={person.id}><td><strong>{person.email}{person.id === user.id && <small className="you">(You)</small>}</strong></td><td>{person.name}</td><td><StatusPill value={person.role === 'super_admin' ? 'Super admin' : person.role === 'admin' ? 'Admin' : 'Member'}/></td><td>{person.id !== user.id && <button className="row-action"><MoreHorizontal size={17}/></button>}</td></tr>)}</tbody></table></div>}</section>;
}

function ReviewModal({ onClose, onSave, meetings = [] }) {
  const [form, setForm] = useState({title:'',description:'',area:'Design',priority:'Major',status:'Open',stage:'Planning',assignee:'Aria',startDate:'',due:'2026-09-18',meetingId:''});
  const edit = (key,val)=>setForm(x=>({...x,[key]:val}));
  const meetingOptions = [{ value: '', label: 'No related meeting' }, ...meetings.map(m => ({ value: m.id, label: m.title }))];
  return <Modal title="Create task" subtitle="Add a new task to this project. You can fill in more details after creation." onClose={onClose}><form onSubmit={e=>{e.preventDefault(); if(form.title.trim())onSave(form)}}><label>Title<input autoFocus value={form.title} onChange={e=>edit('title',e.target.value)} placeholder="e.g. Fix pagination bug on list view" required/></label><label>Description<textarea value={form.description} onChange={e=>edit('description',e.target.value)} placeholder="Add context, links, or acceptance criteria…" rows="3"/></label><div className="form-grid"><SelectField label="Status" value={form.status} values={['Open','In Progress','Review','Resolved','Rejected']} onChange={v=>edit('status',v)}/><SelectField label="Priority" value={form.priority} values={PRIORITIES} onChange={v=>edit('priority',v)}/><SelectField label="Phase" value={form.stage} values={STAGES} onChange={v=>edit('stage',v)}/><SelectField label="Team" value={form.area} values={AREAS} onChange={v=>edit('area',v)}/><label>Assignee<input value={form.assignee} onChange={e=>edit('assignee',e.target.value)} placeholder="Unassigned"/></label><label><span className="field-label"><Video size={14}/>Related meeting</span><AppSelect value={form.meetingId} options={meetingOptions} onChange={v => edit('meetingId', v)} placeholder="No related meeting" ariaLabel="Related meeting"/></label></div><div className="form-grid"><label>Start date<input type="date" value={form.startDate} onChange={e=>edit('startDate',e.target.value)}/></label><label>Due date<input type="date" value={form.due} onChange={e=>edit('due',e.target.value)}/></label></div><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button">Create task <ArrowRight size={16}/></button></div></form></Modal>;
}
function MeetingModal({ onClose, onSave }) { const [form,setForm]=useState({title:'',date:'2026-09-10',notes:'',ai:true}); const edit=(k,v)=>setForm(x=>({...x,[k]:v})); return <Modal title="New meeting" subtitle="Notes are saved to this project and can generate review items." onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(form.title.trim())onSave(form)}}><label>Meeting title<input autoFocus value={form.title} onChange={e=>edit('title',e.target.value)} placeholder="e.g. Design review" required/></label><label>Date<input type="date" value={form.date} onChange={e=>edit('date',e.target.value)}/></label><label>Notes<textarea value={form.notes} onChange={e=>edit('notes',e.target.value)} placeholder="One decision or action per line" rows="6"/></label><label className="switch-label"><input type="checkbox" checked={form.ai} onChange={e=>edit('ai',e.target.checked)}/><span>Prepare AI review suggestions</span></label><div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button">Save meeting <ArrowRight size={16}/></button></div></form></Modal>; }
function ActionDialog({ dialog, onClose }) {
  const isSuccess = !!dialog.success;
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="action-dialog" onMouseDown={e => e.stopPropagation()}><span className={`action-icon${dialog.danger ? ' danger' : ''}${isSuccess ? ' success' : ''}`}>{dialog.icon}</span><h2>{dialog.title}</h2><p>{dialog.subtitle}</p>{isSuccess ? <button className="primary-button action-cta" onClick={() => { onClose(); dialog.onCta && dialog.onCta(); }}>{dialog.ctaLabel || 'Done'}</button> : <div className="modal-actions action-buttons"><button className="text-button" onClick={onClose}>{dialog.cancelLabel || 'Cancel'}</button><button className={dialog.danger ? 'danger-button' : 'primary-button'} onClick={() => { dialog.onConfirm && dialog.onConfirm(); onClose(); }}>{dialog.confirmLabel || 'Confirm'}</button></div>}</section></div>;
}

function AppSelectLegacy({ value, options, onChange, ariaLabel, placeholder = 'Select…' }) { const [open, setOpen] = useState(false); const items = options.map(option => typeof option === 'string' ? { value: option, label: option } : option); const current = items.find(item => item.value === value); return <span className="app-select"><button type="button" className="app-select-trigger" aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen(current => !current)}><span>{current?.label || placeholder}</span><ChevronDown size={15}/></button>{open && <span className="app-select-menu">{items.map(item => <button type="button" key={item.value} className={item.value === value ? 'selected' : ''} onClick={() => { onChange(item.value); setOpen(false); }}><span>{item.label}</span>{item.value === value && <Check size={14}/>}</button>)}</span>}</span>; }
function SelectField({ label,value,values,onChange }) { const icons = { Phase: ClipboardList, Team: Users, Status: CircleDot, Priority: Flag, Epic: Target, Feature: SquaresFour, Sprint: Rows, Labels: Tag, 'Estimate (hours)': Clock3 }; const Icon = icons[label] || SlidersHorizontal; return <label><span className="field-label"><Icon size={14}/>{label}</span><AppSelect value={value} options={values} onChange={onChange} ariaLabel={label}/></label>; }
function Modal({title,subtitle,onClose,children}) { return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={19}/></button><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>; }


class AppErrorBoundary extends Component {
  state = { error: null, info: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error('Unhandled Synqra runtime error:', error, info);
    this.setState({ info });
  }
  resetCache = () => {
    try {
      localStorage.removeItem('synqra-dashboard-v1');
      localStorage.removeItem('synqra-sidebar-collapsed');
    } catch {}
    window.location.href = window.location.pathname;
  };
  reload = () => {
    window.location.reload();
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="auth-shell">
        <section className="auth-card" style={{ maxWidth: 520, textAlign: 'left' }}>
          <div className="auth-brand" style={{ justifyContent: 'flex-start' }}>
            <img className="synqra-logo auth-logo" src="/logo-synqra.png" alt="Synqra" />
          </div>
          <h1 style={{ fontSize: 22, marginTop: 16 }}>Application Encountered an Error</h1>
          <p style={{ color: '#687a92', fontSize: 13, lineHeight: 1.5 }}>
            Synqra caught an unexpected issue during execution. You can reload the application or reset local cache to restore standard operation.
          </p>
          <div style={{
            margin: '14px 0 18px',
            padding: '12px 14px',
            borderRadius: 8,
            background: '#fff3f3',
            border: '1px solid #fed2d2',
            color: '#b91c1c',
            fontSize: 12,
            fontFamily: 'monospace',
            maxHeight: 140,
            overflow: 'auto',
            whiteSpace: 'pre-wrap'
          }}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="primary-button" onClick={this.reload}>
              <RotateCcw size={15} /> Reload Application
            </button>
            <button className="secondary-button" onClick={this.resetCache}>
              Reset Local Cache
            </button>
          </div>
        </section>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>);
