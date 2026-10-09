import { parseJson } from './utils.js';
import { ensureWorkspaceSchema } from './schema.js';

export async function bootstrap(env, userId, requestedProjectId = null) {
  await ensureWorkspaceSchema(env);
  const user = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
  const scope = column => `${column} IN (SELECT p.id FROM projects p WHERE ? IN ('super_admin','admin') OR EXISTS(SELECT 1 FROM project_memberships pm WHERE pm.project_id=p.id AND pm.user_id=?) OR (p.id=? AND p.access_mode='link'))`;
  const scoped = sql => env.DB.prepare(sql).bind(user?.role || 'member',userId,requestedProjectId);
  const projectsResult = await scoped(`SELECT p.id, p.space_id AS spaceId, p.name, p.description, p.access_mode AS accessMode,p.created_by AS createdBy FROM projects p WHERE ${scope("p.id")} ORDER BY p.name`).all();
  const membershipsResult = await env.DB.prepare('SELECT project_id AS projectId, role FROM project_memberships WHERE user_id = ?').bind(userId).all();
  const membershipIds = new Set(membershipsResult.results.map(item => item.projectId));
  const projects = ['super_admin', 'admin'].includes(user?.role)
    ? projectsResult.results
    : projectsResult.results.filter(item => membershipIds.has(item.id) || (item.id === requestedProjectId && item.accessMode === 'link'));
  for (const project of projects) project.role = ['super_admin','admin'].includes(user?.role) ? 'editor' : membershipsResult.results.find(item => item.projectId === project.id)?.role || 'viewer';
  const allowedProjectIds = new Set(projects.map(item => item.id));
  const [reviews, meetings, spaces, workflowStatuses, sprints, metadata, unread, workload, report] = await env.DB.batch([
    scoped(`SELECT id, key, title, area, priority, stage, assignee, assignees, due, start_date AS startDate, description, status, submitted_by AS submittedBy, reporter, meeting_id AS meetingId, estimate_hours AS estimateHours, epic, feature, sprint, labels, project_id AS projectId, parent_id AS parentId, item_type AS itemType, sprint_id AS sprintId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews WHERE ${scope("project_id")} ORDER BY created_at DESC`),
    scoped(`SELECT id, title, date, ai, notes, template_id AS templateId, project_id AS projectId, (SELECT COUNT(*) FROM reviews WHERE meeting_id = m.id AND archived = 0) AS itemCount, attendees FROM meetings m WHERE ${scope("m.project_id")} ORDER BY date DESC`),
    env.DB.prepare('SELECT id, name, key, description FROM spaces ORDER BY name'),
    scoped(`SELECT id, project_id AS projectId, name, color, position, is_terminal AS isTerminal FROM workflow_statuses WHERE ${scope("project_id")} ORDER BY project_id, position`),
    scoped(`SELECT id, project_id AS projectId, name, goal, start_date AS startDate, end_date AS endDate, status FROM sprints WHERE ${scope("project_id")} ORDER BY start_date DESC`),
    scoped(`SELECT id, project_id AS projectId, type, name, parent_id AS parentId, color, COALESCE(status, CASE WHEN COALESCE(archived, 0) = 1 THEN 'archived' ELSE 'active' END) AS status, COALESCE(archived, 0) AS archived FROM project_metadata WHERE ${scope("project_id")} ORDER BY type, name`),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM notifications n WHERE n.user_id = ? AND n.read_at IS NULL AND
      (n.project_id IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = n.project_id AND
        (? IN ('super_admin','admin') OR p.access_mode = 'link' OR EXISTS
          (SELECT 1 FROM project_memberships pm WHERE pm.project_id = p.id AND pm.user_id = ?))))`).bind(userId, user?.role || 'member', userId),
    scoped(`SELECT project_id AS projectId, COALESCE(NULLIF(assignee,''),'Unassigned') AS assignee, COUNT(*) AS count FROM reviews WHERE archived = 0 AND ${scope("project_id")} GROUP BY project_id, COALESCE(NULLIF(assignee,''),'Unassigned') ORDER BY count DESC`),
    scoped(`SELECT project_id AS projectId, stage, COUNT(*) AS count FROM reviews WHERE archived = 0 AND ${scope("project_id")} GROUP BY project_id, stage ORDER BY count DESC`)
  ]);
  const visibleSpaces = spaces.results.filter(space => projects.some(projectRow => projectRow.spaceId === space.id));
  const currentProject = projects[0] ? { ...projects[0], initials: projects[0].name.slice(0, 1).toUpperCase() } : null;
  return { project: currentProject, reviews: reviews.results.filter(r => allowedProjectIds.has(r.projectId)).map(r => ({ ...r, labels: parseJson(r.labels, []), assignees: parseJson(r.assignees, []) })), meetings: meetings.results.filter(m => allowedProjectIds.has(m.projectId)).map(m => ({ ...m, ai: Boolean(m.ai), attendees: parseJson(m.attendees, []) })), spaces: visibleSpaces, projects, workflowStatuses: workflowStatuses.results.filter(s => allowedProjectIds.has(s.projectId)).map(s => ({ ...s, isTerminal: Boolean(s.isTerminal) })), sprints: sprints.results.filter(s => allowedProjectIds.has(s.projectId)), metadata: metadata.results.filter(item => allowedProjectIds.has(item.projectId)), unreadNotifications: Number(unread.results[0]?.count || 0), workload: workload.results.filter(row => allowedProjectIds.has(row.projectId)), reportByStatus: report.results.filter(row => allowedProjectIds.has(row.projectId)) };
}
