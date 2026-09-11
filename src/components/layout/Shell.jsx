import { useEffect, useState } from 'react';
import {
  Archive, ArrowRight, Bell, CalendarBlank as CalendarDays, CalendarPlus, Check,
  CheckCircle as CheckCircle2, CaretUpDown as ChevronsUpDown,
  ClipboardText as ClipboardList, Crown, EnvelopeSimple, Folder, House as Home,
  Info, Kanban as KanbanSquare, ChartBar, List as Menu, ChatCircle as MessageCircle,
  DotsThreeVertical as MoreVertical, Plus, MagnifyingGlass as Search, Gear as Settings,
  ShieldCheck, Sparkle as Sparkles, Trash as Trash2, UserPlus, Users, X
} from '@phosphor-icons/react';
import { relativeDate } from '../../lib/dates';
import { statusFor } from '../../lib/helpers';

export function NotificationMenu({ notifications, onClose, onOpen, onRead, onReadAll }) {
  return <div className="notification-menu"><div className="search-results-head"><span>Notifications</span><span><button className="notification-read-all" onClick={onReadAll}>Mark all read</button><button onClick={onClose}><X size={14}/></button></span></div>{notifications.length ? notifications.slice(0, 8).map(item => <button className={item.read ? 'read' : 'unread'} key={item.id} onClick={()=>{onRead(item);if(item.reviewId){onOpen({id:item.reviewId,title:item.title});}onClose()}}><span className="notification-icon"><Bell size={14}/></span><span><strong>{item.title}</strong><small>{item.body} · {relativeDate(item.createdAt)}</small></span>{!item.read && <i className="notification-unread-dot"/>}</button>) : <p>No notifications yet.</p>}</div>;
}

export function Sidebar({ page, setPage, menuOpen, setMenuOpen, collapsed, onMenuClick, user, onSignOut, project, onProjectClick }) {
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



export function ProjectSwitcher({ project, projects = [], onSelect, onNew, onClose, collapsed = false }) {
  const [query, setQuery] = useState('');
  const visible = projects.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  return <div className={`project-switcher${collapsed ? ' sidebar-collapsed' : ''}`}><div className="switcher-head"><span className="switcher-title">PROJECT</span><button className="switcher-close" onClick={onClose} aria-label="Close"><X size={15}/></button></div><label className="project-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects"/></label><div className="project-list">{visible.length ? visible.map(item => <button key={item.id} className={item.id === project.id ? 'selected' : ''} onClick={() => onSelect(item)}><Folder size={16}/><span>{item.name}</span>{item.id === project.id && <Check size={16}/>}</button>) : <p className="project-empty">No projects found.</p>}</div><button className="new-project" onClick={onNew}><Plus size={16}/> New project</button></div>;
}
