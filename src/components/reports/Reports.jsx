import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CaretDown as ChevronDown, ChartBar, ChartDonut, ChartLineUp, ChartPieSlice, Clock, Flag, FolderSimple, Gauge, ListChecks, Lightning, ArrowCounterClockwise as RotateCcw, Timer, TrendDown, TrendUp, UsersThree, Warning as TriangleAlert, CheckCircle as CheckCircle2, XCircle } from '@phosphor-icons/react';
import { REPORT_COLORS, statusFor } from '../../lib/helpers';
import { activeReviews, isResolved, portfolioProjects, taskOverview, sprintTasks, sprintStats, statusCounts, priorityCounts, teamWorkload, hoursTotals, formatHours } from '../../lib/reports';
import { localToday, slashDate } from '../../lib/dates';
import { reportsApi } from '../../api/reports';
import { AppSelect } from '../common/AppSelect';
import { Wave } from '../Wave.jsx';
import { StatusPill, Priority, PageHeading, Empty } from '../common/ui';

export const RAG_META = {
  'On Track': { color: REPORT_COLORS.success, Icon: CheckCircle2 },
  'At Risk': { color: REPORT_COLORS.warning, Icon: TriangleAlert },
  Delayed: { color: REPORT_COLORS.danger, Icon: XCircle }
};
export function RagPill({ value }) {
  const meta = RAG_META[value] || RAG_META['On Track'];
  const Icon = meta.Icon;
  return <span className={`rag ${value.toLowerCase().replace(' ', '-')}`}><Icon size={14}/> {value}</span>;
}
export function KpiCard({ label, value, icon: Icon, tone = 'slate', hint }) {
  return <article className={`kpi-card tint-${tone}`}><span className="kpi-icon" aria-hidden="true"><Icon size={18}/></span><div><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}
const niceTicks = max => {
  const step = Math.max(1, Math.ceil(max / 4));
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, index) => index * step);
};
export function Donut({ segments, size = 150, thickness = 22, label = 'total' }) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - thickness) / 2;
  const circle = 2 * Math.PI * radius;
  const visible = segments.filter(item => item.value > 0);
  // A 2px surface gap separates touching segments; a single segment closes the ring.
  const gap = visible.length > 1 ? 2 : 0;
  let acc = 0;
  return <svg className="donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${total} ${label}: ${visible.map(item => `${item.label || ''} ${item.value}`.trim()).join(', ')}`}>
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef1f5" strokeWidth={thickness} />
    {visible.map((item, index) => {
      const frac = item.value / total;
      const length = Math.max(0, frac * circle - gap);
      const el = <circle key={index} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={item.color} strokeWidth={thickness} strokeDasharray={`${length} ${circle}`} strokeDashoffset={-acc * circle} transform={`rotate(-90 ${size / 2} ${size / 2})`}><title>{`${item.label ? `${item.label}: ` : ''}${item.value} (${Math.round(frac * 100)}%)`}</title></circle>;
      acc += frac;
      return el;
    })}
    <text className="donut-total" x={size / 2} y={size / 2 + 2} textAnchor="middle">{total}</text>
    <text className="donut-caption" x={size / 2} y={size / 2 + 18} textAnchor="middle">{label}</text>
  </svg>;
}
export function BurndownChart({ days }) {
  const width = 1080; const height = 280; const padL = 36; const padR = 40; const padT = 14; const padB = 26;
  const maxY = Math.max(1, ...days.map(d => Math.max(d.remaining, d.ideal)));
  const ticks = niceTicks(maxY);
  const top = ticks[ticks.length - 1];
  const x = i => padL + (days.length > 1 ? i / (days.length - 1) : 0.5) * (width - padL - padR);
  const y = v => padT + (1 - v / top) * (height - padT - padB);
  const line = points => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const remaining = days.map(d => d.remaining);
  const wash = `${line(remaining)} L${x(days.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const last = days.length - 1;
  const labelIdx = days.length > 4 ? [0, Math.floor(days.length / 3), Math.floor(days.length * 2 / 3), last] : days.map((_, i) => i);
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Sprint burndown: ${days[last]?.remaining ?? 0} tasks remaining`}>
    {ticks.map(t => <g key={t}><line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="chart-grid" /><text x={padL - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
    {labelIdx.map(i => <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{days[i].date.slice(5)}</text>)}
    <path d={wash} fill={REPORT_COLORS.accent} opacity="0.05" />
    <path d={line(days.map(d => d.ideal))} fill="none" stroke={REPORT_COLORS.muted} strokeWidth="1.5" strokeDasharray="5 4" />
    <path d={line(remaining)} fill="none" stroke={REPORT_COLORS.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    {days.map((d, i) => <g key={i} className="chart-point"><rect x={x(i) - 12} y={padT} width="24" height={height - padT - padB} fill="transparent" /><circle cx={x(i)} cy={y(d.remaining)} r="4" fill={REPORT_COLORS.accent} stroke="#fff" strokeWidth="2" /><title>{`${d.date}: ${d.remaining} remaining · ideal ${Math.round(d.ideal * 10) / 10}`}</title></g>)}
    <text className="chart-end-label" x={x(last) + 10} y={y(remaining[last]) + 4}>{remaining[last]}</text>
  </svg>;
}
export function CfdChart({ points }) {
  const width = 720; const height = 240; const padL = 32; const padR = 10; const padT = 14; const padB = 26;
  const ticks = niceTicks(Math.max(1, ...points.map(p => p.done + p.active + p.todo)));
  const top = ticks[ticks.length - 1];
  const x = i => padL + (points.length > 1 ? i / (points.length - 1) : 0.5) * (width - padL - padR);
  const y = v => padT + (1 - v / top) * (height - padT - padB);
  const edge = values => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = (low, high) => {
    const bottom = low.map((v, i) => `L${x(points.length - 1 - i).toFixed(1)},${y(low[points.length - 1 - i]).toFixed(1)}`).join(' ');
    return `${edge(high)} ${bottom} Z`;
  };
  const done = points.map(p => p.done);
  const active = points.map(p => p.done + p.active);
  const todo = points.map(p => p.done + p.active + p.todo);
  const zeros = points.map(() => 0);
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative flow">
    {ticks.map(t => <g key={t}><line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="chart-grid" /><text x={padL - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
    {points.map((p, i) => <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{p.label}</text>)}
    <path d={area(active, todo)} fill={REPORT_COLORS.muted} opacity="0.45" />
    <path d={area(done, active)} fill={REPORT_COLORS.info} opacity="0.75" />
    <path d={area(zeros, done)} fill={REPORT_COLORS.success} opacity="0.85" />
    {/* Surface gaps between bands instead of outlines. */}
    <path d={edge(done)} fill="none" stroke="#fff" strokeWidth="2" />
    <path d={edge(active)} fill="none" stroke="#fff" strokeWidth="2" />
    {points.map((p, i) => <g key={i} className="chart-point"><rect x={x(i) - 16} y={padT} width="32" height={height - padT - padB} fill="transparent" /><title>{`${p.label}: ${p.done} done · ${p.active} in progress · ${p.todo} to do`}</title></g>)}
  </svg>;
}
export function Reports({ reviews, projects, sprints, projectName, onRefresh, onOpen, updatedAt }) {
  const updatedSecs = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;
  const [tab, setTab] = useState('portfolio');
  const [projectId, setProjectId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [burnId, setBurnId] = useState('');
  const [burn, setBurn] = useState(null);
  const [burnLoading, setBurnLoading] = useState(false);
  const [expandedSprint, setExpandedSprint] = useState(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const today = localToday();
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
  const reportAssigneeOptions = [{ value: '', label: 'All assignees' }, ...owners.map(o => ({ value: o, label: o }))];
  const reportBurnOptions = projectSprints.map(s => ({ value: s.id, label: s.name }));

  return <section className="page reports-page">
    <PageHeading title="Reports" description={activeTab.desc} action={<div className="heading-actions"><span className="refresh-stamp">{updatedSecs == null ? 'Not synced yet' : updatedSecs < 5 ? 'Updated just now' : `Updated ${updatedSecs}s ago`}</span><button className="ghost-button" onClick={onRefresh}><RotateCcw size={15}/> Refresh</button></div>} />
    <div className="report-tabs">{tabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
    {tab === 'portfolio' && <>
      <div className="kpi-row"><KpiCard label="Total projects" value={portfolio.length} icon={FolderSimple}/><KpiCard label="On track" value={ragCounts['On Track']} icon={CheckCircle2} tone="emerald"/><KpiCard label="At risk" value={ragCounts['At Risk']} icon={TriangleAlert} tone="amber"/><KpiCard label="Delayed" value={ragCounts.Delayed} icon={XCircle} tone="rose"/></div>
      <div className="report-grid-2">
        <div className="rail-card report-card"><h2><ChartDonut size={17}/> Projects by status</h2><p>RAG status across your projects</p><div className="donut-split"><Donut size={148} thickness={18} label={portfolio.length === 1 ? 'project' : 'projects'} segments={[{ label: 'On Track', value: ragCounts['On Track'], color: REPORT_COLORS.success }, { label: 'At Risk', value: ragCounts['At Risk'], color: REPORT_COLORS.warning }, { label: 'Delayed', value: ragCounts.Delayed, color: REPORT_COLORS.danger }]} /><div className="donut-legend counts">{[['On Track', REPORT_COLORS.success], ['At Risk', REPORT_COLORS.warning], ['Delayed', REPORT_COLORS.danger]].map(([name, color]) => <span key={name}><i style={{ background: color }}/>{name}<b>{ragCounts[name]}</b></span>)}</div></div></div>
        <div className="rail-card report-card task-overview-card"><h2><Gauge size={17}/> Task overview</h2><p>Progress across every task in scope</p><div className="report-progress-head"><span>Overall progress</span><span>{Math.round(overview.progress * 1000) / 10}%</span></div><div className="progress report-progress"><span style={{ width: `${overview.progress * 100}%` }}/></div><div className="report-stats"><div className="tint-slate"><i><ListChecks size={18}/></i><strong>{overview.total}</strong><span>Total tasks</span></div><div className="tint-emerald"><i><CheckCircle2 size={18}/></i><strong>{overview.done}</strong><span>Completed</span></div><div className="tint-sky"><i><TrendUp size={18}/></i><strong>{overview.inProgress}</strong><span>In progress</span></div><div className="tint-rose"><i><Clock size={18}/></i><strong>{overview.overdue}</strong><span>Overdue</span></div></div></div>
      </div>
      <div className="rail-card report-table-card"><h2><Lightning size={17}/> Project health</h2><div className="table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th>Tasks</th><th>Done</th><th>Overdue</th><th>Progress</th><th>Active Sprint</th><th>Reason</th></tr></thead><tbody>{portfolio.map(p => {
        const pct = Math.round(p.progress * 100);
        const activeSprint = sprints.find(s => (s.projectId || 'default') === p.id && s.status === 'active');
        return <tr key={p.id}><td><span className="project-cell"><span className="avatar report-avatar">{p.name.slice(0, 2).toUpperCase()}</span><strong>{p.name}</strong></span></td><td><RagPill value={p.status}/></td><td>{p.tasks}</td><td className="num-done">{p.done}</td><td className={p.overdue ? 'num-overdue' : ''}>{p.overdue}</td><td><span className="health-progress"><span className="progress"><span style={{ width: `${pct}%` }}/></span>{pct}%</span></td><td>{activeSprint ? activeSprint.name : '—'}</td><td>{p.tasks === 0 ? 'No tasks yet' : p.overdue > 0 ? `Only ${pct}% complete` : `${pct}% complete`}</td></tr>;
      })}</tbody></table></div></div>
    </>}
    {tab === 'scrum' && <>
      <div className="report-filters">
        <label><span>Project</span><AppSelect value={effectiveProjectId} options={reportProjectOptions} onChange={setProjectId} ariaLabel="Select Project"/></label>
        <label><span>Assignee</span><AppSelect value={assignee} options={reportAssigneeOptions} onChange={setAssignee} ariaLabel="Filter Assignee"/></label>
      </div>
      <div className="report-grid-2">
        <div className="rail-card report-card"><h2><ChartBar size={17}/> Velocity</h2><p>Estimated vs completed hours per sprint</p><VelocityBars stats={velocity} /></div>
        <div className="rail-card report-card"><h2><ChartLineUp size={17}/> Cumulative flow</h2><p>Task distribution per sprint (current snapshot)</p>{cfd.length ? <><CfdChart points={cfd} /><div className="chart-legend"><span><i style={{ background: REPORT_COLORS.success }}/>Done</span><span><i style={{ background: REPORT_COLORS.accent }}/>In Progress</span><span><i style={{ background: REPORT_COLORS.muted }}/>To Do</span></div></> : <Empty text="No sprints yet. Sprints appear here once tasks are planned into them." />}</div>
      </div>
      <div className="rail-card report-card"><div className="report-card-head"><div><h2><TrendDown size={17}/> Sprint burndown</h2><p>Remaining tasks per day vs ideal progress</p></div>{reportBurnOptions.length > 0 && <AppSelect value={burnSprintId} options={reportBurnOptions} onChange={setBurnId} ariaLabel="Burndown sprint"/>}</div>{burnLoading ? <div className="empty-state"><Wave /> Loading burndown…</div> : burn && burn.total ? <><BurndownChart days={burn.days} /><div className="chart-legend"><span><i style={{ background: REPORT_COLORS.muted }}/>Ideal</span><span><i style={{ background: REPORT_COLORS.accent }}/>Remaining</span></div></> : <Empty text="No burndown data for this sprint." />}</div>
      <div className="report-section-head"><h2><Clock size={17}/> Sprint reports <small>{projectSprints.length} {projectSprints.length === 1 ? 'sprint' : 'sprints'}</small></h2></div>
      {projectSprints.map(sprint => {
        const stats = sprintStats(teamReviews, sprint, today);
        const pct = stats.total ? Math.round(stats.done / stats.total * 100) : 0;
        const open = expandedSprint === sprint.id;
        const items = open ? sprintTasks(teamReviews, sprint) : [];
        return <div className="rail-card sprint-row" key={sprint.id}><button className="sprint-row-head" onClick={() => setExpandedSprint(open ? null : sprint.id)}><ChevronDown size={16} className={open ? 'open' : ''}/><div><strong>{sprint.name}</strong><StatusPill value={sprint.status === 'active' ? 'In Progress' : sprint.status === 'completed' ? 'Resolved' : 'Open'}/><small>{sprint.startDate || '—'} → {sprint.endDate || '—'} · {stats.done}/{stats.total} tasks</small></div><div className="sprint-row-stats"><span>Estimate<strong>{formatHours(stats.est)}</strong></span><span className="progress"><span style={{ width: `${pct}%` }}/></span><span>{pct}%</span></div></button>{open && <div className="sprint-row-tasks">{items.length ? items.map(r => <button key={r.id} onClick={() => onOpen(r)}><span className="dot"/><span><strong>{r.key ? `${r.key} ` : ''}{r.title}</strong><small>{r.area} · {statusFor(r)}</small></span><ArrowRight size={15}/></button>) : <p>No tasks in this sprint.</p>}</div>}</div>;
      })}
    </>}
    {tab === 'tasks' && <>
      <div className="kpi-row"><KpiCard label="Total tasks" value={teamReviews.length} icon={ListChecks}/><KpiCard label="Overdue" value={teamReviews.filter(r => r.due && r.due < today && !isResolved(r)).length} icon={Clock} tone="rose"/><KpiCard label="Estimated hours" value={formatHours(hours.est)} icon={Timer} tone="sky"/><KpiCard label="Resolved" value={teamReviews.filter(isResolved).length} icon={CheckCircle2} tone="emerald"/></div>
      <div className="report-grid-2">
        <div className="rail-card report-card"><h2><ChartPieSlice size={17}/> Task status</h2><p>Distribution of tasks by phase</p><div className="donut-split"><Donut size={148} thickness={18} label={teamReviews.length === 1 ? 'task' : 'tasks'} segments={statusData.map((s, i) => ({ label: s.stage, value: s.count, color: [REPORT_COLORS.accent, REPORT_COLORS.info, REPORT_COLORS.warning, REPORT_COLORS.muted, REPORT_COLORS.success, REPORT_COLORS.danger][i % 6] }))} /><div className="donut-legend counts">{statusData.map((s, i) => <span key={s.stage}><i style={{ background: [REPORT_COLORS.accent, REPORT_COLORS.info, REPORT_COLORS.warning, REPORT_COLORS.muted, REPORT_COLORS.success, REPORT_COLORS.danger][i % 6] }}/>{s.stage}<b>{s.count}</b></span>)}</div></div></div>
        <div className="rail-card report-card"><h2><Flag size={17}/> Priority</h2><p>Tasks per priority level</p><div className="hbar-list">{priorityData.map(p => { const total = Math.max(1, priorityData.reduce((sum, x) => sum + x.count, 0)); const tone = p.priority === 'Blocker' ? 'rose' : p.priority === 'Major' ? 'amber' : 'sky'; return <div className={`hbar-row tint-${tone}`} key={p.priority}><div className="hbar-label"><span>{p.priority}</span><b>{p.count}</b><small>{Math.round(p.count / total * 100)}%</small></div><div className="hbar-track"><i style={{ width: `${p.count / total * 100}%` }}/></div></div>; })}</div></div>
      </div>
      <div className="rail-card report-card"><h2><UsersThree size={17}/> Team workload</h2><p>Tasks and estimated hours per person</p>{workloadRows.length ? <div className="team-rows">{workloadRows.map(w => { const max = Math.max(1, ...workloadRows.map(x => x.tasks)); return <div className="team-row-full" key={w.name}><span className="avatar">{w.name.slice(0, 2).toUpperCase()}</span><div className="team-row-main"><div className="team-row-text"><strong>{w.name}</strong><small>{w.tasks} {w.tasks === 1 ? 'task' : 'tasks'} · {formatHours(w.est)} estimated</small></div><div className="hbar-track"><i style={{ width: `${w.tasks / max * 100}%` }}/></div></div></div>; })}</div> : <Empty text="No assigned work yet."/>}</div>
      <div className="rail-card report-table-card"><div className="report-table-head"><h2><ListChecks size={17}/> Task List ({taskRows.length} tasks)</h2><label className="overdue-toggle"><input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)}/> Show overdue only</label></div><div className="table-wrap task-list-table-wrap"><table className="task-list-table"><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due Date</th><th>Estimate</th></tr></thead><tbody>{taskRows.map(r => <tr key={r.id}><td><small className="row-description">{r.key || ''}</small><strong>{r.title}</strong></td><td><StatusPill value={statusFor(r)}/></td><td><Priority value={r.priority}/></td><td>{r.assignee || '—'}</td><td className={r.due && r.due < today && !isResolved(r) ? 'num-overdue' : ''}>{r.due ? slashDate(r.due) : '—'}</td><td>{r.estimateHours != null ? formatHours(r.estimateHours) : '—'}</td></tr>)}</tbody></table></div></div>
    </>}
  </section>;
}
export function VelocityBars({ stats }) {
  const ticks = niceTicks(Math.max(1, ...stats.flatMap(s => [s.est, s.doneEst])));
  const max = ticks[ticks.length - 1];
  if (!stats.length) return <Empty text="No sprints yet. Create a sprint on the Board to track velocity." />;
  return <div className="velocity"><div className="velocity-plot"><div className="velocity-axis">{[...ticks].reverse().map(t => <span key={t}>{t}h</span>)}</div><div className="velocity-groups" style={{ '--grid-rows': ticks.length - 1 }}>{stats.length ? stats.map(s => <div className="velocity-group" key={s.sprint.id}><div className="velocity-bars"><span style={{ height: `${s.est / max * 100}%`, background: REPORT_COLORS.accent }} title={`${s.sprint.name} · estimated ${formatHours(s.est)}`}/><span style={{ height: `${s.doneEst / max * 100}%`, background: REPORT_COLORS.success }} title={`${s.sprint.name} · completed ${formatHours(s.doneEst)}`}/></div><small>{s.sprint.name}</small></div>) : <p>No sprint data.</p>}</div></div><div className="chart-legend"><span><i style={{ background: REPORT_COLORS.accent }}/>Estimated</span><span><i style={{ background: REPORT_COLORS.success }}/>Completed</span></div></div>;
}
