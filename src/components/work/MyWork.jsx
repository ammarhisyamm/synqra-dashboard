import { useMemo, useState } from 'react';
import { Briefcase, CalendarBlank, CaretDown, CheckCircle, Clock, Plus } from '@phosphor-icons/react';
import { statusFor, isAssignedTo } from '../../lib/helpers';
import { formatHours, isClosed, isOverdue } from '../../lib/reports';
import { dateLabel, localToday } from '../../lib/dates';
import { StatusPill, MetricCard, PageHeading, Priority, SelectField } from '../common/ui';
import './my-work.css';

const groups = ['In Progress', 'To Do', 'Done'];

function groupFor(review) {
  if (isClosed(review) || statusFor(review) === 'Resolved') return 'Done';
  if (review.stage === 'In Progress' || statusFor(review) === 'In Progress' || statusFor(review) === 'Review') return 'In Progress';
  return 'To Do';
}

export function MyWork({ readOnly = false, reviews = [], projects = [], activeProjectName, user, onOpen, onCreateTask }) {
  const [projectId,setProjectId] = useState('');
  const filterId = projects.some(project => project.id === projectId) ? projectId : '';
  const today = localToday();
  const assigned = useMemo(() => reviews.filter(review => !review.archived && isAssignedTo(review,user) && projects.some(project => project.id === review.projectId) && (!filterId || review.projectId === filterId)), [reviews, user,projects,filterId]);
  const overdue = assigned.filter(review => isOverdue(review,today)).length;
  const dueSoon = assigned.filter(review => {
    if (!review.due || isClosed(review)) return false;
    const days = Math.ceil((new Date(`${review.due}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
    return days >= 0 && days <= 7;
  }).length;
  const estimatedHours = assigned.reduce((total, review) => total + (Number(review.estimateHours) || 0), 0);

  return <section className="page my-work-page">
    <PageHeading title="My Work" description="Tasks assigned to you across your projects" action={<button disabled={readOnly} className="primary-button" title={`Create in ${activeProjectName || 'current project'}`} onClick={onCreateTask}><Plus size={17}/> Create Task</button>} />
    <div className="my-work-project-filter"><SelectField label="Project" value={projects.some(project => project.id === projectId) ? projectId : ''} options={[{value:'',label:'All projects'},...projects.map(project => ({value:project.id,label:project.name}))]} onChange={setProjectId}/><p>New tasks are created in {activeProjectName || 'the current project'}.</p></div>
    <div className="review-kpis my-work-kpis"><MetricCard label="My tasks" value={assigned.length}/><MetricCard label="Overdue" value={overdue}/><MetricCard label="Due in 7 days" value={dueSoon}/><MetricCard label="Estimated hours" value={formatHours(estimatedHours)}/></div>
    <div className="my-work-list">
      <div className="my-work-list-heading"><h2><Briefcase size={18}/> My Tasks <span>({assigned.length})</span></h2></div>
      {groups.map(group => {
        const items = assigned.filter(review => groupFor(review) === group);
        if (!items.length) return null;
        return <details open className="my-work-group" key={group}><summary><CaretDown className="my-work-group-toggle" size={16} aria-hidden="true"/>{group} <span>({items.length})</span></summary>
          {items.length ? <div className="my-work-rows">{items.map(review => <button className="my-work-row" key={review.id} onClick={() => onOpen(review)}>
            <span className="my-work-row-main"><StatusPill value={statusFor(review)}/><small>{review.key || '—'}</small><strong>{review.title}</strong></span>
            <span className="my-work-row-meta"><span>{projects.find(project => project.id === review.projectId)?.name}</span>{review.area && <span>{review.area}</span>}{review.epic && <span>{review.epic}</span>}{review.sprint && <span>{review.sprint}</span>}{review.estimateHours != null && <span><Clock size={14}/> {formatHours(review.estimateHours)}</span>}{review.due && <span className={isOverdue(review,today) ? 'is-overdue' : ''}><CalendarBlank size={14}/> {dateLabel(review.due)}</span>}<Priority value={review.priority || 'Minor'}/></span>
          </button>)}</div> : null}
        </details>;
      })}
      {!assigned.length && <div className="my-work-empty-state"><CheckCircle size={24}/><strong>No assigned tasks yet</strong><p>Assign yourself a task or create one to get started.</p><button disabled={readOnly} className="primary-button" onClick={onCreateTask}>Create task</button></div>}
    </div>
  </section>;
}
