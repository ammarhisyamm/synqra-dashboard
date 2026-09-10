import { stages, areas, priorities, statuses } from './constants.js';
import { safeText, id } from './utils.js';

export function normalizeReview(input, partial = false) {
  const review = {};
  if (!partial || 'title' in input) {
    review.title = safeText(input.title);
    if (!review.title) throw new Error('A review title is required.');
  }
  if (!partial || 'area' in input) { if (!areas.has(input.area)) throw new Error('Invalid review area.'); review.area = input.area; }
  if (!partial || 'priority' in input) { if (!priorities.has(input.priority)) throw new Error('Invalid priority.'); review.priority = input.priority; }
  if (!partial || 'stage' in input) { const stage = safeText(input.stage, 80); if (!stage) throw new Error('Invalid stage.'); review.stage = stage; }
  if (!partial || 'assignee' in input) review.assignee = safeText(input.assignee, 80);
  if (!partial || 'due' in input) review.due = /^\d{4}-\d{2}-\d{2}$/.test(input.due || '') ? input.due : null;
  if (!partial || 'start_date' in input || 'startDate' in input) {
    const start = input.start_date ?? input.startDate;
    review.start_date = /^\d{4}-\d{2}-\d{2}$/.test(start || '') ? start : null;
  }
  if (!partial || 'description' in input) review.description = safeText(input.description, 4000);
  if (!partial || 'status' in input) { if (!statuses.has(input.status || 'Open')) throw new Error('Invalid review status.'); review.status = input.status || 'Open'; }
  if (!partial || 'submittedBy' in input) review.submitted_by = safeText(input.submittedBy, 120);
  if (!partial || 'meetingId' in input) review.meeting_id = safeText(input.meetingId, 80) || null;
  if (!partial || 'reporter' in input) review.reporter = safeText(input.reporter, 120);
  if (!partial || 'estimateHours' in input) {
    const estimate = input.estimateHours === '' || input.estimateHours == null ? null : Number(input.estimateHours);
    if (estimate !== null && (!Number.isFinite(estimate) || estimate < 0 || estimate > 1000)) throw new Error('Estimate must be between 0 and 1000 hours.');
    review.estimate_hours = estimate;
  }
  if (!partial || 'epic' in input) review.epic = safeText(input.epic, 120);
  if (!partial || 'feature' in input) review.feature = safeText(input.feature, 120);
  if (!partial || 'sprint' in input) review.sprint = safeText(input.sprint, 120);
  if (!partial || 'labels' in input) review.labels = JSON.stringify((Array.isArray(input.labels) ? input.labels : []).map(label => safeText(label, 40)).filter(Boolean).slice(0, 20));
  if (!partial || 'projectId' in input) review.project_id = safeText(input.projectId, 80) || 'default';
  if (!partial || 'parentId' in input) review.parent_id = safeText(input.parentId, 80) || null;
  if (!partial || 'itemType' in input) review.item_type = ['task', 'epic', 'feature'].includes(input.itemType) ? input.itemType : 'task';
  if (!partial || 'sprintId' in input) review.sprint_id = safeText(input.sprintId, 80) || null;
  if ('archived' in input) review.archived = input.archived ? 1 : 0;
  return review;
}


export async function reviewSnapshot(env, reviewId) {
  return env.DB.prepare("SELECT id, key, title, area, priority, stage, assignee, due, start_date AS startDate, description, status, submitted_by AS submittedBy, reporter, meeting_id AS meetingId, estimate_hours AS estimateHours, epic, feature, sprint, labels, project_id AS projectId, parent_id AS parentId, item_type AS itemType, sprint_id AS sprintId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews WHERE id = ?").bind(reviewId).first();
}

export async function notifyUsers(env, excludeUserId, { type, title, body, reviewId = null }) {
  const recipients = await env.DB.prepare('SELECT id FROM users WHERE id != ?').bind(excludeUserId).all();
  if (!recipients.results.length) return;
  await env.DB.batch(recipients.results.map(recipient => env.DB.prepare('INSERT INTO notifications (id, user_id, review_id, type, title, body) VALUES (?, ?, ?, ?, ?, ?)').bind(id(), recipient.id, reviewId, type, title, body)));
}
export async function recordActivity(env, reviewId, userId, action, metadata = {}) {
  const review = await env.DB.prepare('SELECT title, assignee FROM reviews WHERE id = ?').bind(reviewId).first();
  const recipients = await env.DB.prepare('SELECT id FROM users WHERE id != ?').bind(userId).all();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO review_activity (id, review_id, user_id, action, metadata) VALUES (?, ?, ?, ?, ?)').bind(id(), reviewId, userId, action, JSON.stringify(metadata)),
    ...recipients.results.map(recipient => env.DB.prepare('INSERT INTO notifications (id, user_id, review_id, type, title, body) VALUES (?, ?, ?, ?, ?, ?)').bind(id(), recipient.id, reviewId, action, review?.title || 'Task update', `${action} on ${review?.title || 'task'}`))
  ]);
}

