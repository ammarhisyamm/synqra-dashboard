import { CalendarPlus, ChatCircle, Gear, House, Kanban, MagnifyingGlass, Plus, ShieldCheck, Archive, Folder, Briefcase, CalendarBlank, ChartBar, FileText } from '@phosphor-icons/react';
import { Modal } from '../common/ui';
import { statusFor } from '../../lib/status';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';

const navigation = [['Overview', House], ['My Work', Briefcase], ['Meetings', CalendarBlank], ['Project Docs', FileText], ['Reports', ChartBar], ['All Reviews', ChatCircle], ['Board', Kanban], ['Archive', Archive], ['Settings', Gear], ['Admin Management', ShieldCheck]];

export function CommandPalette({ query, setQuery, reviews, projects, activeProjectId, readOnly = false, isAdmin = false, onClose, onNavigate, onNewMeeting, onNewReview, onOpenReview, onSelectProject }) {
  const term = query.trim().toLowerCase();
  const [remote,setRemote]=useState(null);
  const [searchError,setSearchError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setRemote(null);setSearchError('');
    if(!term)return()=>controller.abort();
    const timer=setTimeout(()=>api('/api/work/search?q='+encodeURIComponent(term)+'&limit=20',{ signal:controller.signal }).then(result=>{if(!controller.signal.aborted && Array.isArray(result.items))setRemote(result.items);}).catch(()=>{if(!controller.signal.aborted)setSearchError('Server search is unavailable. Showing loaded tasks.');}),250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[term]);
  const matches = remote || reviews.filter(item => `${item.key || ''} ${item.title} ${item.description || ''} ${item.assignee || ''}`.toLowerCase().includes(term)).slice(0, 7);
  const filteredProjects = (projects || []).filter(item => !term || item.name.toLowerCase().includes(term)).slice(0, 6);
  const filteredNavigation = navigation.filter(([name]) => (name !== 'Admin Management' || isAdmin) && (!term || name.toLowerCase().includes(term)));
  const action = callback => { callback(); onClose(); };
  return <Modal className="command-palette" title="Search and navigation" subtitle="Find tasks, switch projects, or navigate your workspace." onClose={onClose}><div className="command-search"><MagnifyingGlass size={18}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reviews, projects, or navigate…" aria-label="Search reviews, projects, or navigation"/><kbd>Esc</kbd></div>{searchError && <p role="status">{searchError}</p>}<div className="command-scroll"><CommandGroup label="Quick actions"><CommandButton icon={CalendarPlus} label="Start new meeting" disabled={readOnly} hint={readOnly ? 'View only' : 'New'} onClick={() => action(onNewMeeting)}/><CommandButton icon={Plus} label="Submit new review" disabled={readOnly} hint={readOnly ? 'View only' : 'New'} onClick={() => action(onNewReview)}/></CommandGroup><CommandGroup label="Navigate">{filteredNavigation.map(([name, Icon]) => <CommandButton key={name} icon={Icon} label={name} onClick={() => action(() => onNavigate(name === 'Admin Management' ? 'Admin' : name))}/>)}</CommandGroup>{filteredProjects.length > 0 && <CommandGroup label="Projects">{filteredProjects.map(project => <CommandButton key={project.id} icon={Folder} label={project.name} hint={project.id === activeProjectId ? 'Active' : ''} onClick={() => action(() => onSelectProject(project))}/>)}</CommandGroup>}{matches.length > 0 && <CommandGroup label="Reviews">{matches.map(review => <CommandButton key={review.id} icon={ChatCircle} label={review.title} hint={statusFor(review)} onClick={() => action(() => onOpenReview(review))}/>)}</CommandGroup>}{term && !matches.length && !filteredProjects.length && !filteredNavigation.length && <p className="command-empty">No matching results.</p>}</div></Modal>;
}
function CommandGroup({ label, children }) { return <div className="command-group"><span className="command-group-label">{label}</span>{children}</div>; }
function CommandButton({ icon: Icon, label, hint, onClick, disabled }) { return <button disabled={disabled} className="command-item" onClick={onClick}><Icon size={18}/><span>{label}</span>{hint && <small>{hint}</small>}</button>; }
