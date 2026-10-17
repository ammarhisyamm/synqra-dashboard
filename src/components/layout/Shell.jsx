import { useEffect, useRef, useState } from 'react';
import {
  Archive, ArrowRight, Bell, CalendarBlank as CalendarDays, CalendarPlus, Check,
  CheckCircle as CheckCircle2, CaretUpDown as ChevronsUpDown,
  ClipboardText as ClipboardList, Crown, EnvelopeSimple, Folder, House as Home,
  Info, Kanban as KanbanSquare, ChartBar, List as Menu, ChatCircle as MessageCircle,
  DotsThreeVertical as MoreVertical, Plus, MagnifyingGlass as Search, Gear as Settings, Briefcase,
  ShieldCheck, Sparkle as Sparkles, Trash as Trash2, UserPlus, Users, X,
  CaretRight, Lock, MagnifyingGlass, SidebarSimple, SignOut
} from '@phosphor-icons/react';
import { relativeDate } from '../../lib/dates';
import { statusFor } from '../../lib/helpers';

export function NotificationMenu({ notifications, onClose, onOpen, onRead, onReadAll }) {
  return <div className="notification-menu"><div className="search-results-head"><span>Notifications</span><span><button className="notification-read-all" onClick={onReadAll}>Mark all read</button><button onClick={onClose}><X size={14}/></button></span></div>{notifications.length ? notifications.slice(0, 8).map(item => <button className={item.read ? 'read' : 'unread'} key={item.id} onClick={()=>{onRead(item);if(item.reviewId){onOpen({id:item.reviewId,title:item.title});}onClose()}}><span className="notification-icon"><Bell size={14}/></span><span><strong>{item.title}</strong><small>{item.body} · {relativeDate(item.createdAt)}</small></span>{!item.read && <i className="notification-unread-dot"/>}</button>) : <p>No notifications yet.</p>}</div>;
}

const PROJECT_TINTS = ['violet', 'rose', 'emerald', 'amber', 'sky', 'slate'];
// Stable tint per project so the same project keeps its colour everywhere.
export function projectTint(project) {
  const key = String(project?.id || project?.name || '');
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return PROJECT_TINTS[hash % PROJECT_TINTS.length];
}
export function ProjectMark({ project, size = 'md' }) {
  return <span className={`project-mark project-mark-${size} tint-${projectTint(project)}`} aria-hidden="true">{String(project?.name || '?').trim().slice(0, 1).toUpperCase()}</span>;
}

const SIDEBAR_PROJECT_LIMIT = 5;
const SWITCHER_MAX_HEIGHT = 330;
// The sidebar scrolls, so the finder is positioned against the viewport to avoid being clipped.
function anchorStyle(anchor, collapsed) {
  if (!anchor || typeof window === 'undefined') return {};
  const rect = anchor.getBoundingClientRect();
  const width = collapsed ? 240 : rect.width;
  const left = collapsed ? rect.right + 10 : rect.left;
  const top = collapsed ? rect.top : rect.bottom + 4;
  return top + SWITCHER_MAX_HEIGHT > window.innerHeight ? { left, width, bottom: Math.max(8, window.innerHeight - (collapsed ? rect.bottom : rect.top - 4)) } : { left, width, top };
}

export function Sidebar({ page, setPage, menuOpen, setMenuOpen, collapsed, onMenuClick, user, onSignOut, project, projects = [], onSelectProject, onNewProject, onBrowseProjects, projectMenu, canCreateProject = true }) {
  const workspace = [["Overview", Home], ["My Work", Briefcase], ["All Reviews", MessageCircle], ["Meetings", CalendarDays], ["Board", KanbanSquare], ["Reports", ChartBar], ["Archive", Archive]];
  const [accountOpen, setAccountOpen] = useState(false);
  const moreRef = useRef(null);
  const go = name => { setPage(name); setMenuOpen(false); };
  // Keep the active project visible even when it sits beyond the short list.
  const shortlist = projects.slice(0, SIDEBAR_PROJECT_LIMIT);
  const visibleProjects = project?.id && !shortlist.some(item => item.id === project.id) ? [...shortlist.slice(0, SIDEBAR_PROJECT_LIMIT - 1), project] : shortlist;
  const hiddenCount = Math.max(0, projects.length - visibleProjects.length);
  return <aside className={`sidebar${menuOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
    <div className="sidebar-head">
      <div className="sidebar-brand"><img className="synqra-logo" src="/logo-synqra.png" alt="Synqra — Powered by MULIA"/></div>
      <button className="sidebar-menu-btn" onClick={onMenuClick} aria-label="Toggle sidebar" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><SidebarSimple size={18}/></button>
    </div>
    <div className="sidebar-scroll">
      <section><p className="side-label">Main menu</p><nav className="side-nav">{workspace.map(([name, Icon]) => <button key={name} title={name} aria-current={page === name ? 'page' : undefined} className={page === name ? 'active' : ''} onClick={() => go(name)}><Icon size={18} weight={page === name ? 'fill' : 'regular'}/><span>{name}</span></button>)}</nav></section>
      <section className="side-projects">
        <div className="side-section-head"><p className="side-label">Projects</p>{canCreateProject && <button type="button" className="side-section-action" onClick={onNewProject} aria-label="New project" title="New project"><Plus size={14}/></button>}</div>
        <div className="side-project-list">
          {visibleProjects.map(item => <button key={item.id} type="button" title={item.name} aria-current={item.id === project?.id ? 'true' : undefined} className={`side-project${item.id === project?.id ? ' active' : ''}`} onClick={() => { onSelectProject(item); setMenuOpen(false); }}><ProjectMark project={item} size="sm"/><span>{item.name}</span>{item.role === 'viewer' && <Lock size={12} className="side-project-lock" aria-label="View only"/>}</button>)}
          {!projects.length && <p className="side-project-empty">No projects yet</p>}
        </div>
        <div className="side-project-more-wrap" ref={moreRef}>
          <button type="button" className="side-project-more" onClick={onBrowseProjects} aria-haspopup="dialog" aria-expanded={!!projectMenu} title="Browse projects"><MagnifyingGlass size={14}/><span>{hiddenCount ? `All projects (${projects.length})` : 'Find project'}</span></button>
          {projectMenu && <div className="project-switcher-anchor" style={anchorStyle(moreRef.current, collapsed)}>{projectMenu}</div>}
        </div>
      </section>
    </div>
    <div className="sidebar-foot">
      <nav className="side-nav">
        <button title="Settings" aria-current={page === 'Settings' ? 'page' : undefined} className={page === 'Settings' ? 'active' : ''} onClick={() => go('Settings')}><Settings size={18} weight={page === 'Settings' ? 'fill' : 'regular'}/><span>Settings</span></button>
        {['super_admin','admin'].includes(user.role) && <button title="Admin Management" aria-current={page === 'Admin' ? 'page' : undefined} className={page === 'Admin' ? 'active' : ''} onClick={() => go('Admin')}><ShieldCheck size={18} weight={page === 'Admin' ? 'fill' : 'regular'}/><span>Admin Management</span></button>}
      </nav>
      <div className="user-card-wrap">
        <button className="user-card" title={user.name} aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(open => !open)}><div className="avatar avatar-dark">{user.name.slice(0,2).toUpperCase()}</div><div><strong>{user.name}</strong><small>{user.email}</small></div><MoreVertical size={16}/></button>
        {accountOpen && <AccountMenu user={user} onClose={() => setAccountOpen(false)} onSignOut={() => { setAccountOpen(false); onSignOut(); }}/>}
      </div>
    </div>
  </aside>;
}

function useDismiss(ref, onClose, ignoreSelector) {
  useEffect(() => {
    const onDown = event => {
      if (ignoreSelector && event.target instanceof Element && event.target.closest(ignoreSelector)) return;
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ref, onClose, ignoreSelector]);
}

function AccountMenu({ user, onClose, onSignOut }) {
  const ref = useRef(null);
  useDismiss(ref, onClose, '.user-card');
  return <div className="account-menu" role="menu" aria-label="Account" ref={ref}><div className="account-menu-head"><strong>{user.name}</strong><small>{user.email}</small></div><button role="menuitem" autoFocus onClick={onSignOut}><SignOut size={16}/> Sign out</button></div>;
}

export function Breadcrumb({ project, page }) {
  return <nav className="topbar-breadcrumb" aria-label="Breadcrumb"><span className="crumb-project"><ProjectMark project={project} size="xs"/><span>{project?.name || 'No project'}</span></span><CaretRight size={12} aria-hidden="true"/><span className="crumb-page" aria-current="page">{page === 'Admin' ? 'Admin Management' : page}</span></nav>;
}

export function ProjectSwitcher({ project, projects = [], onSelect, onNew, onClose, collapsed = false, canCreateProject = true }) {
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  useDismiss(ref, onClose, '.side-project-more');
  const visible = projects.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  return <div ref={ref} role="dialog" aria-label="Switch project" className={`project-switcher${collapsed ? ' sidebar-collapsed' : ''}`}><label className="project-search"><MagnifyingGlass size={14}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects"/><button type="button" className="switcher-close" onClick={onClose} aria-label="Close"><X size={13}/></button></label><div className="project-list">{visible.length ? visible.map(item => <button key={item.id} className={item.id === project.id ? 'selected' : ''} aria-current={item.id === project.id ? 'true' : undefined} onClick={() => onSelect(item)}><ProjectMark project={item} size="sm"/><span>{item.name}</span>{item.id === project.id && <Check size={14}/>}</button>) : <p className="project-empty">No projects found.</p>}</div>{canCreateProject && <button className="new-project" onClick={onNew}><Plus size={14}/> New project</button>}</div>;
}
