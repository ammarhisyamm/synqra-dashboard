// Pure report computations. All inputs come from /api/bootstrap (reviews,
// projects, sprints), so every number below traces to live D1 rows.
// Conventions shared with pm.promas.id:
// - resolved = status 'Resolved' or stage 'Completed'; archived rows excluded.
// - overdue = due < today and not resolved.
// - RAG: Delayed = overdue older than 7 days; At Risk = any overdue; else On Track.
// NOTE: synqra has no actual-hours time tracking yet, so velocity/reporting
// uses estimate_hours sums. Add `actual_hours` + a timelog table to reach 1:1.
export const isResolved = r => r.status === 'Resolved' || r.stage === 'Completed';
export const isOverdue = (r, today) => !r.archived && !isResolved(r) && r.due && r.due < today;
export const activeReviews = reviews => reviews.filter(r => !r.archived);

export function projectOf(review, projects, fallbackName) {
  if (!projects || !projects.length) return { id: 'default', name: fallbackName };
  return projects.find(p => p.id === review.projectId) || { id: 'default', name: fallbackName };
}

export function ragStatus(items, today) {
  const overdue = items.filter(r => isOverdue(r, today));
  if (overdue.some(r => daysOverdue(r, today) > 7)) return 'Delayed';
  if (overdue.length) return 'At Risk';
  return 'On Track';
}
export function daysOverdue(review, today) {
  if (!review.due || review.due >= today) return 0;
  return Math.floor((new Date(`${today}T12:00:00`) - new Date(`${review.due}T12:00:00`)) / 86400000);
}

export function portfolioProjects(reviews, projects, fallbackName, today) {
  const list = projects && projects.length ? projects : [{ id: 'default', name: fallbackName }];
  return list.map(project => {
    const items = activeReviews(reviews).filter(r => (r.projectId || 'default') === project.id || (!projects.length));
    const done = items.filter(isResolved);
    const overdue = items.filter(r => isOverdue(r, today));
    const progress = items.length ? done.length / items.length : 0;
    return { ...project, tasks: items.length, done: done.length, overdue: overdue.length, progress, status: ragStatus(items, today) };
  });
}

export function taskOverview(reviews, today) {
  const items = activeReviews(reviews);
  const done = items.filter(isResolved);
  const overdue = items.filter(r => isOverdue(r, today));
  return { total: items.length, done: done.length, overdue: overdue.length, progress: items.length ? done.length / items.length : 0 };
}

export function sprintTasks(reviews, sprint) {
  return activeReviews(reviews).filter(r => (sprint.id && r.sprintId === sprint.id) || (sprint.name && r.sprint === sprint.name));
}
export function sprintStats(reviews, sprint, today) {
  const items = sprintTasks(reviews, sprint);
  const done = items.filter(isResolved);
  const est = items.reduce((sum, r) => sum + (Number(r.estimateHours) || 0), 0);
  const doneEst = done.reduce((sum, r) => sum + (Number(r.estimateHours) || 0), 0);
  return { total: items.length, done: done.length, overdue: items.filter(r => isOverdue(r, today)).length, est, doneEst };
}

export function statusCounts(reviews) {
  const map = new Map();
  activeReviews(reviews).forEach(r => map.set(r.stage, (map.get(r.stage) || 0) + 1));
  return [...map.entries()].map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count);
}
export function priorityCounts(reviews) {
  const map = new Map();
  activeReviews(reviews).forEach(r => map.set(r.priority, (map.get(r.priority) || 0) + 1));
  return [...map.entries()].map(([priority, count]) => ({ priority, count })).sort((a, b) => b.count - a.count);
}
export function teamWorkload(reviews) {
  const map = new Map();
  activeReviews(reviews).forEach(r => {
    const name = (r.assignee || 'Unassigned').split(',')[0].trim() || 'Unassigned';
    const entry = map.get(name) || { name, tasks: 0, est: 0 };
    entry.tasks += 1;
    entry.est += Number(r.estimateHours) || 0;
    map.set(name, entry);
  });
  return [...map.values()].sort((a, b) => b.tasks - a.tasks);
}
export function hoursTotals(reviews) {
  const items = activeReviews(reviews);
  return {
    est: items.reduce((sum, r) => sum + (Number(r.estimateHours) || 0), 0),
    doneEst: items.filter(isResolved).reduce((sum, r) => sum + (Number(r.estimateHours) || 0), 0)
  };
}
export const formatHours = value => `${Math.round(Number(value) * 10) / 10}h`;
