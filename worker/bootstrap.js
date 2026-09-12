import { parseJson } from './utils.js';
import { ensureWorkspaceSchema } from './schema.js';

export async function bootstrap(env, userId) {
  await ensureWorkspaceSchema(env);
  const user = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
  const projectsResult = await env.DB.prepare("SELECT p.id, p.space_id AS spaceId, p.name, p.description, p.access_mode AS accessMode FROM projects p ORDER BY p.name").all();
  const membershipsResult = await env.DB.prepare('SELECT project_id AS projectId FROM project_memberships WHERE user_id = ?').bind(userId).all();
  const membershipIds = new Set(membershipsResult.results.map(item => item.projectId));
  const projects = ['super_admin', 'admin'].includes(user?.role)
    ? projectsResult.results
    : projectsResult.results.filter(item => item.accessMode === 'link' || membershipIds.has(item.id));
  const allowedProjectIds = new Set(projects.map(item => item.id));
  const [reviews, meetings, project, spaces, workflowStatuses, sprints, metadata, unread, workload, report] = await env.DB.batch([
    env.DB.prepare("SELECT id, key, title, area, priority, stage, assignee, assignees, due, start_date AS startDate, description, status, submitted_by AS submittedBy, reporter, meeting_id AS meetingId, estimate_hours AS estimateHours, epic, feature, sprint, labels, project_id AS projectId, parent_id AS parentId, item_type AS itemType, sprint_id AS sprintId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews ORDER BY created_at DESC"),
    env.DB.prepare("SELECT id, title, date, ai, notes, project_id AS projectId, (SELECT COUNT(*) FROM reviews WHERE meeting_id = m.id AND archived = 0) AS itemCount, attendees FROM meetings m ORDER BY date DESC"),
    env.DB.prepare("SELECT name, description, access_mode AS accessMode FROM project_settings WHERE id = 'default'"),
    env.DB.prepare('SELECT id, name, key, description FROM spaces ORDER BY name'),
    env.DB.prepare('SELECT id, project_id AS projectId, name, color, position, is_terminal AS isTerminal FROM workflow_statuses ORDER BY project_id, position'),
    env.DB.prepare('SELECT id, project_id AS projectId, name, goal, start_date AS startDate, end_date AS endDate, status FROM sprints ORDER BY start_date DESC'),
    env.DB.prepare("SELECT id, project_id AS projectId, type, name, parent_id AS parentId, color, COALESCE(status, CASE WHEN COALESCE(archived, 0) = 1 THEN 'archived' ELSE 'active' END) AS status, COALESCE(archived, 0) AS archived FROM project_metadata ORDER BY type, name"),
    env.DB.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(userId),
    env.DB.prepare("SELECT project_id AS projectId, COALESCE(NULLIF(assignee,''),'Unassigned') AS assignee, COUNT(*) AS count FROM reviews WHERE archived = 0 GROUP BY project_id, COALESCE(NULLIF(assignee,''),'Unassigned') ORDER BY count DESC"),
    env.DB.prepare("SELECT project_id AS projectId, stage, COUNT(*) AS count FROM reviews WHERE archived = 0 GROUP BY project_id, stage ORDER BY count DESC")
  ]);
  const settings = project.results[0] || { name: 'Acme Redesign', description: '', accessMode: 'link' };
  const visibleSpaces = spaces.results.filter(space => projects.some(projectRow => projectRow.spaceId === space.id));
  return { project: { id: 'default', ...settings, initials: settings.name.slice(0, 1).toUpperCase() }, reviews: reviews.results.filter(r => allowedProjectIds.has(r.projectId)).map(r => ({ ...r, labels: parseJson(r.labels, []), assignees: parseJson(r.assignees, []) })), meetings: meetings.results.filter(m => allowedProjectIds.has(m.projectId)).map(m => ({ ...m, ai: Boolean(m.ai), attendees: parseJson(m.attendees, []) })), spaces: visibleSpaces, projects, workflowStatuses: workflowStatuses.results.filter(s => allowedProjectIds.has(s.projectId)).map(s => ({ ...s, isTerminal: Boolean(s.isTerminal) })), sprints: sprints.results.filter(s => allowedProjectIds.has(s.projectId)), metadata: metadata.results.filter(item => allowedProjectIds.has(item.projectId)), unreadNotifications: Number(unread.results[0]?.count || 0), workload: workload.results.filter(row => allowedProjectIds.has(row.projectId)), reportByStatus: report.results.filter(row => allowedProjectIds.has(row.projectId)) };
}
