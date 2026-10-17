import { useState } from 'react';
import {
  ArrowRight, CalendarBlank as CalendarDays, CalendarPlus, ClipboardText as ClipboardList,
  FileText, Info, Plus, Sparkle as Sparkles
} from '@phosphor-icons/react';
import { STAGES, STAGE_ICONS } from '../../constants/workflow';
import { localToday, dateLabel, relativeDate } from '../../lib/dates';
import { statusFor } from '../../lib/helpers';
import { SectionHead, AttentionCard, StatusPill, Empty, Metric, PageHeading } from '../common/ui';

export function Dashboard({ readOnly = false, reviews, meetings, workload, reportByStatus, sprints, goTo, onSubmitReview, onNewMeeting }) {
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const today = localToday();
  const needsAttention = reviews.filter(r => r.stage !== 'Completed' && (r.priority === 'Blocker' || r.due < today)).slice(0, 4);
  const completed = reviews.filter(r => r.stage === 'Completed').length;
  const blockers = reviews.filter(r => r.priority === 'Blocker').length;
  const overdue = reviews.filter(r => r.due < today && r.stage !== 'Completed').length;
  return <section className="page dashboard-page">
    <PageHeading title="Overview" description={day} action={<button disabled={readOnly} className="primary-button" onClick={onSubmitReview}><Plus size={16}/> New task</button>}/>
    <div className="dashboard-grid">
      <div className="dashboard-main">
        <SectionHead title="Needs attention" action={() => goTo('All Reviews')} actionLabel="View all reviews" />
        <div className="attention-list">{needsAttention.length ? needsAttention.map(r => <AttentionCard key={r.id} review={r} today={today} onReview={() => goTo('All Reviews')}/>) : <Empty text="Nothing needs attention right now."/>}</div>
        <SectionHead title="Active stages" aside={`${reviews.length ? new Set(reviews.map(review => review.stage)).size : 0} stages`} />
        {reviews.length ? <div className="stage-grid">{STAGES.map((stage, index) => {
          const items = reviews.filter(r => r.stage === stage);
          const done = items.filter(r => r.stage === 'Completed' || r.stage === 'Final').length;
          const blocked = items.some(r => r.priority === 'Blocker');
          const Icon = STAGE_ICONS[index];
          return <button type="button" className="stage-card" key={stage} onClick={() => goTo('Board')} aria-label={`${stage} stage — open board`}><div className="card-meta"><span className="icon-tile" aria-hidden="true"><Icon size={18}/></span><StatusPill value={blocked ? 'Blocked' : stage === 'Completed' || stage === 'Final' ? 'Complete' : 'In progress'} /></div><h3>{stage}</h3><div className="progress-row"><div className="progress"><span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}/></div><small>{done}/{items.length}</small></div></button>;
        })}</div> : <div className="dashboard-empty"><ClipboardList size={25}/><strong>No tasks yet</strong><p>Create your first task to see stages appear here.</p><button disabled={readOnly} className="primary-button" onClick={onSubmitReview}><Plus size={16}/> New task</button></div>}
        <SectionHead title="Team Workload" aside="open of total tasks per member" />
        <WorkloadChart reviews={reviews}/>
        <SectionHead title="Recent activity" action={() => goTo('All Reviews')} actionLabel="View all activity" />
        <div className="activity-panel">{[...reviews].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(r => <div className="activity-row" key={r.id}><span className="icon-tile icon-tile-sm" aria-hidden="true"><FileText size={15}/></span><div><strong>{r.title}</strong><p>{r.area} · {r.stage}</p></div><time>{relativeDate(r.createdAt)}</time></div>)}</div>
      </div>
      <div className="dashboard-rail"><MeetingRail readOnly={readOnly} meetings={meetings} goTo={goTo} onNew={onNewMeeting}/><Summary reviews={reviews} completed={completed} blockers={blockers} overdue={overdue}/><SprintSummary sprints={sprints} reviews={reviews}/></div>
    </div>
  </section>;
}

const isDone = review => review.stage === 'Completed' || statusFor(review) === 'Resolved';
const ownerOf = review => (review.assignee || '').split(',')[0].trim() || 'Unassigned';
// Open vs done per member, stacked on one bar so load and progress read together.
export function WorkloadChart({ reviews }) {
  const people = {};
  reviews.filter(review => !review.archived).forEach(review => {
    const name = ownerOf(review);
    people[name] = people[name] || { name, open: 0, done: 0 };
    people[name][isDone(review) ? 'done' : 'open'] += 1;
  });
  const rows = Object.values(people).map(person => ({ ...person, total: person.open + person.done })).sort((a, b) => b.open - a.open || b.total - a.total).slice(0, 8);
  const max = Math.max(1, ...rows.map(row => row.total));
  if (!rows.length) return <div className="workload-chart"><Empty text="No active workload yet."/></div>;
  return <div className="workload-chart">
    <div className="chart-legend wl-legend"><span><i className="wl-key-open"/>Open</span><span><i className="wl-key-done"/>Done</span></div>
    {rows.map(row => <div className="wl-row" key={row.name} title={`${row.name}: ${row.open} open · ${row.done} done`}>
      <span className="wl-name"><span className="wl-avatar" aria-hidden="true">{row.name === 'Unassigned' ? '?' : row.name.slice(0, 2).toUpperCase()}</span><span>{row.name}</span></span>
      <div className="wl-bar" role="img" aria-label={`${row.open} open, ${row.done} done`}>
        {row.open > 0 && <i className="wl-open" style={{ width: `${row.open / max * 100}%` }}/>}
        {row.done > 0 && <i className="wl-done" style={{ width: `${row.done / max * 100}%` }}/>}
      </div>
      <span className="wl-count"><strong>{row.open}</strong><small>/{row.total}</small></span>
    </div>)}
  </div>;
}

export function MeetingRail({ readOnly = false, meetings, goTo, onNew }) { return <aside className="rail-card"><div className="rail-head"><h2>Meetings</h2><button disabled={readOnly} className="new-btn" onClick={onNew}><Plus size={14}/> New meeting</button></div>{meetings.length ? meetings.slice(0, 4).map(m => <button className="meeting-row" key={m.id} onClick={() => goTo('Meetings')}><span className="meeting-icon"><CalendarDays size={16}/></span><span><strong>{m.title}</strong><small>{dateLabel(m.date)}</small></span>{m.ai && <Sparkles size={15} className="meeting-ai"/>}</button>) : <div className="meeting-empty"><CalendarPlus size={27}/><strong>No meetings yet</strong><p>Start a quick review or schedule one for later.</p><div><button disabled={readOnly} className="primary-button" onClick={onNew}><CalendarPlus size={14}/> Quick start</button><button className="secondary-button" onClick={() => goTo('Meetings')}>View all</button></div></div>}<button className="view-all" onClick={() => goTo('Meetings')}>View all meetings <ArrowRight size={14}/></button></aside>; }
export function Summary({ reviews, completed, blockers, overdue }) { return <aside className="rail-card summary"><h2>Summary</h2><p>Project overview</p><div className="summary-list"><Metric label="Total reviews" value={reviews.length}/><Metric label="Resolved" value={completed}/><Metric label="Blockers" value={blockers}/><Metric label="Open items" value={reviews.length - completed}/><Metric label="Areas" value={new Set(reviews.map(r => r.area)).size}/></div><div className="summary-alert"><Info size={15}/><span>{blockers ? `${blockers} blocker · ` : ''}{overdue} overdue need attention.</span></div></aside>; }
export function SprintSummary({ sprints, reviews }) { const sprint = sprints.find(item => item.status === 'active') || sprints[0]; if (!sprint) return null; const items = reviews.filter(item => item.sprintId === sprint.id || item.sprint === sprint.name); const done = items.filter(item => item.stage === 'Completed' || statusFor(item) === 'Resolved').length; return <aside className="rail-card sprint-summary"><h2>{sprint.name}</h2><p>{sprint.status} sprint{items.length ? ` · ${done}/${items.length} done` : ''}</p><div className="progress"><span style={{width:`${items.length ? done / items.length * 100 : 0}%`}}/></div><small>{sprint.goal || 'No sprint goal yet.'}</small></aside>; }
