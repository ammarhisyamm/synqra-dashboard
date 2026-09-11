import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowRight, Bell, CalendarBlank as CalendarDays, CalendarPlus, Check, CheckCircle as CheckCircle2, CaretDown as ChevronDown, CaretLeft as ChevronLeft, CaretRight as ChevronRight, CaretUpDown as ChevronsUpDown, Circle as CircleDot,
  ClipboardText as ClipboardList, Clock, Clock as Clock3, Copy, DownloadSimple as Download, ArrowSquareOut as ExternalLink, Eye, Flag, Folder, House as Home, Info, Kanban as KanbanSquare, Link as Link2, ListChecks, Lock,
  List as Menu, ChatCircle as MessageCircle, DotsThree as MoreHorizontal, DotsThreeVertical as MoreVertical, CursorClick as MousePointer2, PencilLine as Pencil, Plus, ArrowCounterClockwise as RotateCcw, MagnifyingGlass as Search, Gear as Settings, GearSix as Settings2, ShieldCheck, SlidersHorizontal, Sparkle as Sparkles, SquaresFour, Rows, Tag, Target, Trash as Trash2, Warning as TriangleAlert, ArrowUUpLeft as Undo2, User, UserPlus, EnvelopeSimple, Crown, Users, VideoCamera as Video, ChartBar, TrendUp, ChartPieSlice, Lightning, XCircle, X
} from '@phosphor-icons/react';
import { Wave } from './components/Wave.jsx';
import { STORAGE_KEY, AREAS, STAGES, PRIORITIES, STAGE_ICONS } from './constants/workflow';
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
import { AppSelect } from './components/common/AppSelect';

import { REPORT_COLORS, seed, loadData, statusFor, nextTaskKey, downloadReviewsCsv, elapsedLabel, makeHistoryModel, historyDateLabel, deduplicateNotifications, extractNotes } from './lib/helpers';
import { ErrorPanel } from './components/common/ErrorPanel';
import { SectionHead, AttentionCard, StatusPill, Empty, Metric, InlineSync, DetailSection, MetricCard, Priority, PageHeading, DatePicker, ActionDialog, SelectField, Modal } from './components/common/ui';
import { NotificationMenu, Sidebar, ProjectSwitcher } from './components/layout/Shell';
import { AuthLoading, AuthScreen, CollaboratorModal } from './components/auth/Auth';
import { Dashboard, MeetingRail, Summary, SprintSummary } from './components/dashboard/Dashboard';
import { Reviews } from './components/reviews/Reviews';
import { ReviewDetailEnhanced } from './components/reviews/ReviewDetail';
import { Meetings, MeetingModal } from './components/meetings/MeetingsView';
import { RAG_META, RagPill, Donut, BurndownChart, CfdChart, Reports, VelocityBars } from './components/reports/Reports';
import { ArchivePage } from './components/archive/ArchivePage';
import { SettingsPageEnhanced } from './components/settings/SettingsPage';
import { AdminPageEnhanced } from './components/admin/AdminPage';
import { ReviewModal } from './components/reviews/ReviewModal';

export function App() {
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
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [pendingOps, setPendingOps] = useState(0);
  const [savingField, setSavingField] = useState(null);
  const [savedField, setSavedField] = useState(null);
  const [failedField, setFailedField] = useState(null);
  const [bootFailed, setBootFailed] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedReview, setSelectedReview] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [team, setTeam] = useState([]);
  const refreshTeam = () => { api('/api/team').then(data => setTeam(data.team || [])).catch(() => {}); };
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data]);
  useEffect(() => {
    const requestedProjectId = new URLSearchParams(window.location.search).get('project');
    api('/api/auth/me').then(({ user: signedInUser }) => {
      setUser(signedInUser);
      refreshTeam();
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
    const timer = window.setTimeout(() => setBootFailed(true), 20000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const onShortcut = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(open => !open); }
      if (event.key === 'Escape') { setCommandOpen(false); setNotificationsOpen(false); }
    };
    const onUnhandled = event => {
      console.error('Unhandled promise rejection:', event.reason);
      setToast(`Something didn’t finish: ${event.reason?.message || 'unexpected error'}. Your data is safe — try again.`);
    };
    window.addEventListener('keydown', onShortcut);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => { window.removeEventListener('keydown', onShortcut); window.removeEventListener('unhandledrejection', onUnhandled); };
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
  const updateReview = async (id, patch, field) => {
    const previous = data.reviews.find(item => item.id === id);
    if (!previous) return;
    setData(prev => ({ ...prev, reviews: prev.reviews.map(r => r.id === id ? { ...r, ...patch } : r) }));
    setPendingOps(count => count + 1);
    if (field) {
      setSavingField({ id, field });
      setSavedField(prev => (prev && prev.id === id && prev.field === field ? null : prev));
      setFailedField(prev => (prev && prev.id === id && prev.field === field ? null : prev));
    }
    try {
      const saved = await reviewsApi.update(id, patch);
      setData(prev => ({ ...prev, reviews: prev.reviews.map(item => item.id === id ? { ...item, ...saved } : item) }));
      if (field) setSavedField({ id, field, at: Date.now() });
      return saved;
    } catch (error) {
      setData(prev => ({ ...prev, reviews: prev.reviews.map(item => item.id === id ? previous : item) }));
      if (field) setFailedField({ id, field, error: error.message, patch });
      setToast(error.message);
    } finally {
      setPendingOps(count => Math.max(0, count - 1));
      if (field) setSavingField(null);
    }
  };
  const addReview = async (review) => {
    const saved = { id: crypto.randomUUID(), createdAt: new Date().toISOString().slice(0, 10), archived: false, projectId: data.project?.id || 'default', ...review };
    if (!/^AR-\d+$/.test(saved.key || '')) saved.key = nextTaskKey(data.reviews);
    setData(prev => ({ ...prev, reviews: [saved, ...prev.reviews] }));
    setPendingOps(count => count + 1);
    try {
      const created = await reviewsApi.create(saved);
      setData(prev => ({ ...prev, reviews: prev.reviews.map(r => r.id === saved.id ? created : r) }));
      return created;
    } catch (error) {
      setData(prev => ({ ...prev, reviews: prev.reviews.filter(item => item.id !== saved.id) }));
      setToast(error.message);
      throw error;
    } finally {
      setPendingOps(count => Math.max(0, count - 1));
    }
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
    setDialog({ danger: true, icon: <Trash2 size={24}/>, title: 'Delete this meeting?', subtitle: target ? `"${target.title}" and its notes will be permanently deleted.` : 'This meeting will be permanently deleted.', confirmLabel: 'Delete meeting', onConfirm: async () => {
      setData(prev => ({ ...prev, meetings: prev.meetings.filter(m => m.id !== id) }));
      try {
        await meetingsApi.remove(id);
      } catch (error) {
        if (target) setData(prev => ({ ...prev, meetings: [target, ...prev.meetings] }));
        setToast(error.message);
      }
    } });
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'synqra-export.json'; a.click(); URL.revokeObjectURL(url);
    setToast('Project data exported');
  };
  const refreshMetadata = async () => { try { const result = await metadataApi.list(); setData(previous => ({ ...previous, metadata: result.metadata })); } catch (error) { setToast(error.message); } };
  const refreshAll = () => { refreshTeam(); api('/api/bootstrap').then(remote => { setData(previous => { const selectedId = previous.project?.id; const selectedProject = selectedId && selectedId !== 'default' ? remote.projects.find(item => item.id === selectedId) : remote.project; return { ...remote, project: selectedProject || remote.project }; }); setCloudReady(true); }).catch(error => setToast(error.message)); };
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
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      let skip = false;
      setPendingOps(count => { if (count > 0) skip = true; return count; });
      if (skip) return;
      setSyncing(true);
      try {
        const [remote, notificationResult] = await Promise.all([api('/api/bootstrap'), notificationsApi.list()]);
        if (!active) return;
        setData(previous => {
          const selectedId = previous.project?.id;
          const selectedProject = selectedId && selectedId !== 'default' ? remote.projects.find(item => item.id === selectedId) : remote.project;
          return { ...remote, project: selectedProject || remote.project };
        });
        setNotifications(prev => deduplicateNotifications(prev, notificationResult.notifications));
        setLastSync(Date.now());
      } catch { /* keep the current optimistic view and retry on the next tick */ }
      finally { if (active) setSyncing(false); }
    };
    sync();
    const interval = window.setInterval(sync, 10000);
    const onOnline = () => { setOnline(true); sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
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
      const results = await Promise.allSettled(items.map(item => addReview({ title: item.title, description: item.description, area: item.area, priority: item.priority, stage: 'Planning', status: 'Open', assignee: item.assignee, due: item.due, meetingId: created.id })));
      const createdCount = results.filter(result => result.status === 'fulfilled').length;
      const failedCount = results.length - createdCount;
      // itemCount is derived server-side (COUNT subquery); just reflect the true count locally.
      setData(prev => ({ ...prev, meetings: prev.meetings.map(m => m.id === created.id ? { ...m, itemCount: createdCount } : m) }));
      setPage('Meetings');
      if (failedCount) setToast(`${failedCount} task could not be created. Please try again.`);
      showSuccess(`${createdCount} task${createdCount === 1 ? '' : 's'} created`, failedCount ? 'The meeting was saved, but some selected tasks need to be retried.' : 'The meeting and its selected action items are now synced to the project.', 'View board', () => setPage('Board'));
    } catch { /* addMeeting already surfaced the error */ }
  };

  if (user === undefined) {
    if (bootFailed) {
      return <div className="auth-shell"><section className="auth-card" style={{ maxWidth: 480, textAlign: 'left' }}><div className="auth-brand" style={{ justifyContent: 'flex-start' }}><img className="synqra-logo auth-logo" src="/logo-synqra.png" alt="Synqra" /></div><h1 style={{ fontSize: 22, marginTop: 16 }}>Something went wrong</h1><p style={{ color: '#687a92', fontSize: 13, lineHeight: 1.5 }}>We couldn&apos;t load this workspace. Your saved data is safe. Try again or return to the previous page.</p><div style={{ display: 'flex', gap: 10 }}><button className="primary-button" onClick={() => window.location.reload()}><RotateCcw size={15}/> Try again</button><button className="secondary-button" onClick={() => { if (window.history.length > 1) window.history.back(); }}>Go back</button></div></section></div>;
    }
    return <AuthLoading/>;
  }
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
      {collabOpen && <CollaboratorModal user={user} onClose={() => setCollabOpen(false)} onToast={setToast} onMembersChanged={refreshTeam} />}
      <ErrorPanel compact key={page}>
      {page === 'Overview' && <Dashboard reviews={activeReviews} meetings={activeMeetings} workload={activeWorkload} reportByStatus={activeReportByStatus} sprints={activeSprints} goTo={setPage} onSubmitReview={() => setModal('review')} onNewMeeting={openNewMeeting} />}
      {page === 'All Reviews' && <Reviews reviews={activeReviews} query={query} setQuery={setQuery} updateReview={updateReview} archiveReview={archiveReview} setModal={setModal} onOpen={setSelectedReview} teamList={team} sync={{ saving: savingField, saved: savedField, failed: failedField }} onRetry={failed => { setFailedField(null); updateReview(failed.id, failed.patch, failed.field); }} />}
      {page === 'Meetings' && <Meetings meetings={activeMeetings} reviews={activeReviews} addMeeting={addMeeting} addReview={addReview} onDeleteMeeting={deleteMeeting} setToast={setToast} setModal={setModal} onNewMeeting={openNewMeeting} onTasksCreated={count => showSuccess(`${count} review items created`, 'Action items from the meeting notes are now on the board.', 'View board', () => setPage('Board'))} onOpen={setSelectedReview} />}
      {page === 'Meeting Editor' && <MeetingEditor user={user} team={team} onClose={() => setPage('Meetings')} onToast={setToast} onCreate={createMeetingFromEditor} />}
      {page === 'Board' && <KanbanWorkspace project={data.project} team={team} reviews={activeReviews} sprints={activeSprints} metadata={(data.metadata || []).filter(item => !item.projectId || item.projectId === activeProjectId)} projectId={activeProjectId} updateReview={updateReview} createSprint={addSprint} updateSprint={updateSprint} refreshMetadata={refreshMetadata} setModal={setModal} onOpen={setSelectedReview} requestConfirm={opts => setDialog(opts)} onToast={setToast} />}
      {page === 'Archive' && <ArchivePage reviews={data.reviews.filter(r => r.archived)} restoreReview={restoreReview} goTo={setPage} />}
      {page === 'Reports' && <Reports reviews={data.reviews} projects={data.projects || []} sprints={data.sprints || []} projectName={data.project.name} onRefresh={refreshAll} onOpen={setSelectedReview} updatedAt={lastSync} />}
      {page === 'Settings' && <SettingsPageEnhanced project={data.project} user={user} saveProject={saveProject} setToast={setToast} onDeleteProject={() => setModal('delete-project')} />}
      {page === 'Admin' && <AdminPageEnhanced user={user} setToast={setToast} requestConfirm={opts => setDialog(opts)} />}
      </ErrorPanel>
    </main>
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
    <ErrorPanel compact key={'modal-' + String(modal) + '-' + (selectedReview ? selectedReview.id : 'none')}>
    {modal === 'review' && <ReviewModal meetings={activeMeetings} team={team} onClose={() => setModal(null)} onSave={(review) => { addReview(review); setModal(null); showSuccess('Review created', `"${review.title}" is now on the board.`, 'View All Reviews', () => setPage('All Reviews')); }} />}
    {modal === 'meeting' && <MeetingModal onClose={() => setModal(null)} onSave={async meeting => { await addMeeting(meeting); setModal(null); showSuccess('Meeting saved', `"${meeting.title}" has been added to Meetings.`, 'View Meetings', () => setPage('Meetings')); }} />}
    {modal === 'project' && <NewProjectModal onClose={() => setModal(null)} onCreate={createProject} />}
    {modal === 'delete-project' && data.project?.id !== 'default' && <DeleteProjectModal project={data.project} onClose={() => setModal(null)} onDelete={deleteProject} />}
    {selectedReview && <ReviewDetailEnhanced review={selectedReview} meetings={activeMeetings} metadata={(data.metadata || []).filter(item => !item.projectId || item.projectId === activeProjectId)} sprints={activeSprints} user={user} team={team} onClose={() => setSelectedReview(null)} onUpdated={saved => { setData(prev => ({...prev, reviews: prev.reviews.map(r => r.id === saved.id ? {...r, ...saved} : r)})); setSelectedReview(saved); }} onDeleted={id => { setData(prev => ({...prev, reviews: prev.reviews.filter(r => r.id !== id)})); setSelectedReview(null); showSuccess('Task deleted', 'The task has been permanently removed.', 'Done'); }} onToast={setToast} onRemoveRequest={doDelete => setDialog({ danger: true, icon: <Trash2 size={24}/>, title: 'Delete this review?', subtitle: 'This review and its comments will be permanently deleted.', confirmLabel: 'Delete review', onConfirm: doDelete })} />}
    {dialog && <ActionDialog dialog={dialog} onClose={() => setDialog(null)} />}
    </ErrorPanel>
  </div>;
}
