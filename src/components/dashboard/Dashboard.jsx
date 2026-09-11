import { useState } from 'react';
import {
  ArrowRight, CalendarBlank as CalendarDays, CalendarPlus, ClipboardText as ClipboardList,
  FileText, Info, Plus, Sparkle as Sparkles
} from '@phosphor-icons/react';
import { STAGES, STAGE_ICONS } from '../../constants/workflow';
import { dateLabel, relativeDate } from '../../lib/dates';
import { statusFor } from '../../lib/helpers';
import { SectionHead, AttentionCard, StatusPill, Empty, Metric } from '../common/ui';

export function Dashboard({ reviews, meetings, workload, reportByStatus, sprints, goTo, onSubmitReview, onNewMeeting }) {
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
        <SectionHead title="Needs attention" action={() => goTo('All Reviews')} actionLabel="View all reviews" />
        <div className="attention-list">{needsAttention.length ? needsAttention.map(r => <AttentionCard key={r.id} review={r} today={today} onReview={() => goTo('All Reviews')}/>) : <Empty text="Nothing needs attention right now."/>}</div>
        <SectionHead title="Active stages" aside={`${reviews.length ? new Set(reviews.map(review => review.stage)).size : 0} stages`} />
        {reviews.length ? <div className="stage-grid">{STAGES.map((stage, index) => {
          const items = reviews.filter(r => r.stage === stage);
          const done = items.filter(r => r.stage === 'Completed' || r.stage === 'Final').length;
          const blocked = items.some(r => r.priority === 'Blocker');
          const Icon = STAGE_ICONS[index];
          return <button type="button" className="stage-card" key={stage} onClick={() => goTo('Board')} aria-label={`${stage} stage — open board`}><div className="card-meta"><Icon size={18}/><StatusPill value={blocked ? 'Blocked' : stage === 'Completed' || stage === 'Final' ? 'Complete' : 'In progress'} /></div><h3>{stage}</h3><div className="progress-row"><div className="progress"><span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}/></div><small>{done}/{items.length}</small></div></button>;
        })}</div> : <div className="dashboard-empty"><ClipboardList size={25}/><strong>No review items yet</strong><p>Submit your first review to see stages appear here.</p><button className="primary-button" onClick={onSubmitReview}><Plus size={16}/> Submit Review</button></div>}
        <SectionHead title="Team Workload" aside="active tasks per member" />
        <div className="workload-chart">{(() => { const people = {}; reviews.filter(r => !r.archived && r.stage !== 'Completed' && statusFor(r) !== 'Resolved').forEach(r => { const name = (r.assignee || 'Unassigned').split(',')[0].trim() || 'Unassigned'; people[name] = people[name] || { name, total: 0, done: 0 }; people[name].total += 1; }); reviews.filter(r => !r.archived && (r.stage === 'Completed' || statusFor(r) === 'Resolved')).forEach(r => { const name = (r.assignee || 'Unassigned').split(',')[0].trim() || 'Unassigned'; people[name] = people[name] || { name, total: 0, done: 0 }; people[name].done += 1; }); const rows = Object.values(people).map(p => ({ ...p, open: p.total, count: p.total + p.done })).sort((a, b) => b.count - a.count).slice(0, 8); const max = Math.max(1, ...rows.map(r => r.count)); return rows.length ? rows.map(item => <div className="wl-row" key={item.name} title={`${item.done} done · ${item.open} open`}><span className="wl-name">{item.name}</span><div className="wl-bar"><i style={{ width: `${item.count / max * 100}%` }}/></div><span className="wl-count">{item.count}</span></div>) : <Empty text="No active workload yet."/>; })()}</div>
        <SectionHead title="Recent activity" action={() => goTo('All Reviews')} actionLabel="View all activity" />
        <div className="activity-panel">{[...reviews].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(r => <div className="activity-row" key={r.id}><FileText size={18} aria-hidden="true"/><div><strong>{r.title}</strong><p>{r.area} · {r.stage}</p></div><time>{relativeDate(r.createdAt)}</time></div>)}</div>
      </div>
      <div className="dashboard-rail"><MeetingRail meetings={meetings} goTo={goTo} onNew={onNewMeeting}/><Summary reviews={reviews} completed={completed} blockers={blockers} overdue={overdue}/><SprintSummary sprints={sprints} reviews={reviews}/></div>
    </div>
  </section>;
}

export function MeetingRail({ meetings, goTo, onNew }) { return <aside className="rail-card"><div className="rail-head"><h2>Meetings</h2><button className="new-btn" onClick={onNew}><Plus size={14}/> New meeting</button></div>{meetings.length ? meetings.slice(0, 4).map(m => <button className="meeting-row" key={m.id} onClick={() => goTo('Meetings')}><span className="meeting-icon"><CalendarDays size={16}/></span><span><strong>{m.title}</strong><small>{dateLabel(m.date)}</small></span>{m.ai && <Sparkles size={15} className="meeting-ai"/>}</button>) : <div className="meeting-empty"><CalendarPlus size={27}/><strong>No meetings yet</strong><p>Start a quick review or schedule one for later.</p><div><button className="primary-button" onClick={onNew}><CalendarPlus size={14}/> Quick start</button><button className="secondary-button" onClick={() => goTo('Meetings')}>View all</button></div></div>}<button className="view-all" onClick={() => goTo('Meetings')}>View all meetings <ArrowRight size={14}/></button></aside>; }
export function Summary({ reviews, completed, blockers, overdue }) { return <aside className="rail-card summary"><h2>Summary</h2><p>Project overview</p><div className="summary-list"><Metric label="Total reviews" value={reviews.length}/><Metric label="Resolved" value={completed}/><Metric label="Blockers" value={blockers}/><Metric label="Open items" value={reviews.length - completed}/><Metric label="Areas" value={new Set(reviews.map(r => r.area)).size}/></div><div className="summary-alert"><Info size={15}/><span>{blockers ? `${blockers} blocker · ` : ''}{overdue} overdue need attention.</span></div></aside>; }
export function SprintSummary({ sprints, reviews }) { const sprint = sprints.find(item => item.status === 'active') || sprints[0]; if (!sprint) return null; const items = reviews.filter(item => item.sprintId === sprint.id || item.sprint === sprint.name); const done = items.filter(item => item.stage === 'Completed' || statusFor(item) === 'Resolved').length; return <aside className="rail-card sprint-summary"><h2>{sprint.name}</h2><p>{sprint.status} sprint{items.length ? ` · ${done}/${items.length} done` : ''}</p><div className="progress"><span style={{width:`${items.length ? done / items.length * 100 : 0}%`}}/></div><small>{sprint.goal || 'No sprint goal yet.'}</small></aside>; }
