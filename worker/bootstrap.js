import { parseJson } from './utils.js';
import { ensureWorkspaceSchema } from './schema.js';

export async function bootstrap(env, userId) {
  await ensureWorkspaceSchema(env);
  const [reviews, meetings, project, spaces, projects, workflowStatuses, sprints, metadata, unread, workload, report] = await env.DB.batch([
    env.DB.prepare("SELECT id, key, title, area, priority, stage, assignee, due, start_date AS startDate, description, status, submitted_by AS submittedBy, reporter, meeting_id AS meetingId, estimate_hours AS estimateHours, epic, feature, sprint, labels, project_id AS projectId, parent_id AS parentId, item_type AS itemType, sprint_id AS sprintId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews ORDER BY created_at DESC"),
    env.DB.prepare("SELECT id, title, date, ai, notes, project_id AS projectId, (SELECT COUNT(*) FROM reviews WHERE meeting_id = m.id AND archived = 0) AS itemCount, attendees FROM meetings m ORDER BY date DESC"),
    env.DB.prepare("SELECT name, description, access_mode AS accessMode FROM project_settings WHERE id = 'default'"),
    env.DB.prepare('SELECT id, name, key, description FROM spaces ORDER BY name'),
    env.DB.prepare('SELECT id, space_id AS spaceId, name, description, access_mode AS accessMode FROM projects ORDER BY name'),
    env.DB.prepare('SELECT id, project_id AS projectId, name, color, position, is_terminal AS isTerminal FROM workflow_statuses ORDER BY project_id, position'),
    env.DB.prepare('SELECT id, project_id AS projectId, name, goal, start_date AS startDate, end_date AS endDate, status FROM sprints ORDER BY start_date DESC'),
    env.DB.prepare("SELECT id, project_id AS projectId, type, name, parent_id AS parentId, color, COALESCE(status, CASE WHEN COALESCE(archived, 0) = 1 THEN 'archived' ELSE 'active' END) AS status, COALESCE(archived, 0) AS archived FROM project_metadata ORDER BY type, name"),
    env.DB.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(userId),
    env.DB.prepare("SELECT COALESCE(NULLIF(assignee,''),'Unassigned') AS assignee, COUNT(*) AS count FROM reviews WHERE archived = 0 GROUP BY COALESCE(NULLIF(assignee,''),'Unassigned') ORDER BY count DESC"),
    env.DB.prepare("SELECT stage, COUNT(*) AS count FROM reviews WHERE archived = 0 GROUP BY stage ORDER BY count DESC")
  ]);
  const settings = project.results[0] || { name: 'Acme Redesign', description: '', accessMode: 'link' };
  return { project: { id: 'default', ...settings, initials: settings.name.slice(0, 1).toUpperCase() }, reviews: reviews.results.map(r => ({ ...r, labels: parseJson(r.labels, []) })), meetings: meetings.results.map(m => ({ ...m, ai: Boolean(m.ai), attendees: parseJson(m.attendees, []) })), spaces: spaces.results, projects: projects.results, workflowStatuses: workflowStatuses.results.map(s => ({ ...s, isTerminal: Boolean(s.isTerminal) })), sprints: sprints.results, metadata: metadata.results, unreadNotifications: Number(unread.results[0]?.count || 0), workload: workload.results, reportByStatus: report.results };
}
