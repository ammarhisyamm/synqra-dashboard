import { useMemo } from 'react';
import { Briefcase, CalendarBlank, CheckCircle, Clock, Plus } from '@phosphor-icons/react';
import { statusFor } from '../../lib/helpers';
import { formatHours, isResolved } from '../../lib/reports';
import { dateLabel } from '../../lib/dates';
import { StatusPill, MetricCard, PageHeading, Priority } from '../common/ui';

const groups = ['In Progress', 'To Do', 'Done'];

function isAssignedTo(review, user) {
  const candidates = [user?.id, user?.name, user?.email].filter(Boolean).map(value => String(value).toLowerCase());
  return [review.assignee, ...(Array.isArray(review.assignees) ? review.assignees : [])].filter(Boolean)
    .some(value => candidates.includes(String(value).toLowerCase()));
}

function groupFor(review) {
  if (isResolved(review) || review.stage === 'Completed' || statusFor(review) === 'Resolved') return 'Done';
  if (review.stage === 'In Progress' || statusFor(review) === 'In Progress' || statusFor(review) === 'Review') return 'In Progress';
  return 'To Do';
}

export function MyWork({ reviews = [], user, onOpen, onCreateTask }) {
  const today = new Date().toISOString().slice(0, 10);
  const assigned = useMemo(() => reviews.filter(review => isAssignedTo(review, user)), [reviews, user]);
  const overdue = assigned.filter(review => review.due && review.due < today && !isResolved(review)).length;
  const dueSoon = assigned.filter(review => {
    if (!review.due || isResolved(review)) return false;
    const days = Math.ceil((new Date(`${review.due}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
    return days >= 0 && days <= 7;
  }).length;
  const estimatedHours = assigned.reduce((total, review) => total + (Number(review.estimateHours) || 0), 0);

  return <section className="page my-work-page">
    <PageHeading title="My Work" action={<button className="primary-button" onClick={onCreateTask}><Plus size={17}/> Create Task</button>} />
    <p className="my-work-subtitle">Tasks assigned to you across this project</p>
    <div className="review-kpis my-work-kpis"><MetricCard label="My tasks" value={assigned.length}/><MetricCard label="Overdue" value={overdue}/><MetricCard label="Due in 7 days" value={dueSoon}/><MetricCard label="Estimated hours" value={formatHours(estimatedHours)}/></div>
    <div className="my-work-list">
      <div className="my-work-list-heading"><h2><Briefcase size={18}/> My Tasks <span>({assigned.length})</span></h2></div>
      {groups.map(group => {
        const items = assigned.filter(review => groupFor(review) === group);
        return <section className="my-work-group" key={group}><h3><span className="my-work-group-toggle">⌄</span>{group} <span>({items.length})</span></h3>
          {items.length ? <div className="my-work-rows">{items.map(review => <button className="my-work-row" key={review.id} onClick={() => onOpen(review)}>
            <span className="my-work-row-main"><StatusPill value={statusFor(review)}/><small>{review.key || '—'}</small><strong>{review.title}</strong></span>
            <span className="my-work-row-meta">{review.area && <span>{review.area}</span>}{review.epic && <span>{review.epic}</span>}{review.sprint && <span>{review.sprint}</span>}{review.estimateHours != null && <span><Clock size={14}/> {formatHours(review.estimateHours)}</span>}{review.due && <span className={review.due < today && !isResolved(review) ? 'is-overdue' : ''}><CalendarBlank size={14}/> {dateLabel(review.due)}</span>}<Priority value={review.priority || 'Normal'}/></span>
          </button>)}</div> : <p className="my-work-empty">No tasks in this stage.</p>}
        </section>;
      })}
      {!assigned.length && <div className="my-work-empty-state"><CheckCircle size={24}/><strong>You’re all caught up</strong><p>No tasks are assigned to you in this project.</p></div>}
    </div>
  </section>;
}
