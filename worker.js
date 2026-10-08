import { stages, areas, priorities, statuses, MAX_ATTACHMENT_BYTES } from './worker/constants.js';
import { json, safeText, id, sessionCookie, cookieValue, publicUser, parseJson, readBody, authRateLimited, tooManyRequests, MIN_PASSWORD_LENGTH } from './worker/utils.js';
import { ensureWorkspaceSchema } from './worker/schema.js';
import { passwordHash, passwordMatches, sessionUser, createSession, signedIn, canAccessProject, projectIdForReview } from './worker/auth.js';
import { normalizeReview, reviewSnapshot, notifyUsers, recordActivity } from './worker/reviews.js';
import { bootstrap } from './worker/bootstrap.js';
import { handleAiGenerate } from './worker/ai.js';
import { handleProjectPeople } from './worker/project-people.js';
import { calendarDate, dateRange } from './worker/validation.js';
import { handleSecurity, verifyMfa, handlePasswordReset } from './worker/security.js';
import { handleOperations, releaseInfo, cleanupStatement, drainFileCleanup, maintenance, recordOperationalEvent, notifyMentions } from './worker/operations.js';
import { handleSearch } from './worker/search.js';
import { creationReceipt } from './worker/idempotency.js';
import { handleNotetaker, handlePublicMeeting, syncNotetakers, activeProjectCapture } from './worker/notetaker.js';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);
const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};
const localAppOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);
function isAllowedMutationOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  const configuredOrigins = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    new URL(request.url).origin,
    ...localAppOrigins,
    ...configuredOrigins
  ]);
  return allowedOrigins.has(origin);
}
const accessDenied = () => json({ error: 'You do not have access to this project.' }, 403);
async function requireProject(env, user, projectId, permission = 'view') {
  return canAccessProject(env, user, projectId || 'default', permission);
}
async function validateRelations(env, review, projectId, reviewId) {
  try { dateRange(review.start_date, review.due); } catch (error) { return error.message; }
  for (const [key, table, label] of [['meeting_id','meetings','Meeting'], ['parent_id','reviews','Parent item'], ['sprint_id','sprints','Sprint']]) {
    if (!review[key]) continue;
    if (key === 'parent_id' && review[key] === reviewId) return 'A task cannot be its own parent.';
    const related = await env.DB.prepare(`SELECT project_id FROM ${table} WHERE id=?`).bind(review[key]).first();
    if (!related || related.project_id !== projectId) return `${label} must belong to the same project.`;
  }
  if (review.parent_id) {
    const ancestors = new Set(reviewId ? [reviewId] : []);
    let parentId = review.parent_id;
    while (parentId) {
      if (ancestors.has(parentId)) return 'Parent items cannot form a cycle.';
      ancestors.add(parentId);
      if (ancestors.size > 100) return 'Task hierarchy is too deep.';
      const parent = await env.DB.prepare('SELECT parent_id FROM reviews WHERE id=?').bind(parentId).first();
      parentId = parent?.parent_id;
    }
  }
  return null;
}
async function metadataParentError(env, parentId, projectId, type) {
  if (!parentId) return null;
  if (type !== 'feature') return 'Only features can have a parent epic.';
  const parent = await env.DB.prepare("SELECT project_id, type, archived FROM project_metadata WHERE id=?").bind(parentId).first();
  if (!parent || parent.project_id !== projectId || parent.type !== 'epic' || parent.archived) return 'Parent epic must be active and belong to the same project.';
  return null;
}
async function canCreateProject(env, user) {
  return user.role !== 'viewer';
}
async function canManageProject(env,user,projectId) {
  if (['admin','super_admin'].includes(user.role)) return true;
  const owner = await env.DB.prepare('SELECT created_by FROM projects WHERE id=?').bind(projectId).first('created_by');
  return owner===user.id && await requireProject(env,user,projectId,'edit');
}
async function visibleProjectRows(env, user, rows) {
  if (['super_admin', 'admin'].includes(user.role)) return rows;
  const visible = await Promise.all(rows.map(async row => ({ row, allowed: await requireProject(env, user, row.projectId, 'view') })));
  return visible.filter(item => item.allowed).map(item => item.row);
}
function secureResponse(response) {
  const headers = new Headers(response.headers);
  Object.entries(securityHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function routeApi(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/api/health' && request.method === 'GET') {
    // Readiness must prove the deployed schema, not merely database reachability.
    await env.DB.batch([env.DB.prepare('SELECT created_by FROM projects LIMIT 0'),env.DB.prepare('SELECT token_hash FROM password_resets LIMIT 0'),env.DB.prepare('SELECT object_key FROM file_cleanup LIMIT 0'),env.DB.prepare('SELECT status FROM meeting_captures LIMIT 0'),env.DB.prepare('SELECT token_hash FROM meeting_shares LIMIT 0')]);
    return json({ ok:true,...releaseInfo(env) });
  }
  if (path.startsWith('/api/auth/') && request.method === 'POST' && env.AUTH_RATE_LIMITER) {
    const key = request.headers.get('cf-connecting-ip') || 'unknown';
    if (!(await env.AUTH_RATE_LIMITER.limit({ key })).success) return tooManyRequests();
  }
  if (MUTATING_METHODS.has(request.method)) {
    // The production UI is served by Vercel and proxies /api/* to this Worker.
    // In that setup the browser Origin is the Vercel origin while request.url is
    // the Worker origin. Validate against an explicit allowlist instead of
    // comparing those two unrelated origins directly.
    if (!isAllowedMutationOrigin(request, env)) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  }
  if (path==='/api/auth/password-reset' && request.method==='POST') return handlePasswordReset(request,env);
  const sharedMeeting = await handlePublicMeeting(request,env);
  if (sharedMeeting) return sharedMeeting;
  if (request.method === 'POST' && path === '/api/auth/register') {
    if (authRateLimited(request)) return tooManyRequests();
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const email = safeText(body.email, 254).toLowerCase(); const name = safeText(body.name, 80) || email.split('@')[0]; const username = safeText(body.username, 40).toLowerCase() || email.split('@')[0].replace(/[^a-z0-9_-]/g, ''); const password = typeof body.password === 'string' ? body.password : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (!/^[a-z0-9_-]{3,40}$/.test(username)) return json({ error: 'Use a username with 3–40 letters, numbers, hyphens, or underscores.' }, 400);
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) return json({ error: `Use ${MIN_PASSWORD_LENGTH}–128 characters for your password.` }, 400);
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? OR username = ?').bind(email, username).first();
    if (existing) return json({ error: 'An account with that email already exists.' }, 409);
    // Public registration must never grant workspace-wide administrator access.
    // Initial admins are provisioned through a verified, operator-only process.
    const user = { id: id(), email, name, role:'member' };
    user.username = username;
    await env.DB.prepare('INSERT INTO users (id, email, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)').bind(user.id, user.email, user.username, user.name, await passwordHash(password), user.role).run();
    return signedIn(user, await createSession(user, env), 201);
  }
  if (request.method === 'POST' && path === '/api/auth/login') {
    if (authRateLimited(request)) return tooManyRequests();
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const identifier = safeText(body.identifier || body.email, 254).toLowerCase(); const password = typeof body.password === 'string' ? body.password : '';
    const user = await env.DB.prepare('SELECT id, email, username, name, role, password_hash FROM users WHERE email = ? OR username = ?').bind(identifier, identifier).first();
    if (!user || !(await passwordMatches(password, user.password_hash))) return json({ error: 'Username, email, or password is incorrect.' }, 401);
    if (!await verifyMfa(env,user.id,body.code)) return json({ error:'Enter a valid authenticator or recovery code.',mfaRequired:true },401);
    return signedIn(user, await createSession(user, env));
  }
  if (request.method === 'POST' && path === '/api/auth/logout') {
    const token = cookieValue(request, sessionCookie); if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store', 'set-cookie': `${sessionCookie}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` } });
  }
  if (request.method === 'GET' && path === '/api/auth/me') {
    const user = await sessionUser(request, env); return user ? json({ user: publicUser(user) }) : json({ error: 'Sign in required.' }, 401);
  }

  const user = await sessionUser(request, env);
  if (!user) return json({ error: 'Sign in required.' }, 401);
  await ensureWorkspaceSchema(env);
  const notetakerResponse = await handleNotetaker(request,env,user);
  if (notetakerResponse) return notetakerResponse;
  const officeResponse = await handleSecurity(request,env,user) || await handlePasswordReset(request,env,user) || await handleOperations(request,env,user) || await handleSearch(request,env,user);
  if (officeResponse) return officeResponse;
  const peopleResponse = await handleProjectPeople(request, env, user);
  if (peopleResponse) return peopleResponse;
  if (request.method === 'POST' && path === '/api/ai/generate') {
    if (env.AI_RATE_LIMITER && !(await env.AI_RATE_LIMITER.limit({ key:user.id })).success) return tooManyRequests();
    return handleAiGenerate(request, env);
  }
  if (request.method === 'GET' && path === '/api/admin/users') {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const result = await env.DB.prepare('SELECT id, email, username, name, role, created_at AS createdAt FROM users ORDER BY CASE role WHEN \'super_admin\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END, name').all();
    return json({ users: result.results });
  }
  if (request.method === 'GET' && path === '/api/metadata') {
    const result = await env.DB.prepare("SELECT id, project_id AS projectId, type, name, parent_id AS parentId, color, COALESCE(status, CASE WHEN COALESCE(archived, 0) = 1 THEN 'archived' ELSE 'active' END) AS status, COALESCE(archived, 0) AS archived FROM project_metadata ORDER BY type, name").all();
    return json({ metadata: await visibleProjectRows(env, user, result.results) });
  }
  if (request.method === 'POST' && path === '/api/metadata') {
    const body = await readBody(request); if (!body || !['epic', 'feature', 'label'].includes(body.type)) return json({ error: 'Invalid metadata type.' }, 400);
    const item = { id: id(), projectId: safeText(body.projectId, 80) || 'default', type: body.type, name: safeText(body.name, 100), parentId: safeText(body.parentId, 80) || null, color: /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#111b30' };
    if (!item.name) return json({ error: 'Name is required.' }, 400);
    if (!await requireProject(env, user, item.projectId, 'edit')) return accessDenied();
    const parentError = await metadataParentError(env, item.parentId, item.projectId, item.type);
    if (parentError) return json({ error: parentError }, 400);
    try { await env.DB.prepare('INSERT INTO project_metadata (id, project_id, type, name, parent_id, color, status, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(item.id, item.projectId, item.type, item.name, item.parentId, item.color, 'active', 0).run(); await notifyUsers(env, user.id, { projectId: item.projectId, type: 'metadata_created', title: item.type + ' created', body: user.name + ' created ' + item.name }); return json({ ...item, status: 'active', archived: 0 }, 201); } catch { return json({ error: 'That item already exists in this project.' }, 409); }
  }
  const metadataMatch = path.match(/^\/api\/metadata\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && metadataMatch) {
    const item = await env.DB.prepare('SELECT project_id AS projectId, type FROM project_metadata WHERE id=?').bind(metadataMatch[1]).first();
    if (!item) return json({ error: 'Metadata not found.' }, 404);
    if (!await requireProject(env, user, item.projectId, 'edit')) return accessDenied();
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const fields = {}; if ('name' in body) { fields.name = safeText(body.name, 100); if (!fields.name) return json({ error: 'Name is required.' }, 400); } if ('parentId' in body) fields.parent_id = safeText(body.parentId, 80) || null; if ('color' in body && /^#[0-9a-fA-F]{6}$/.test(body.color)) fields.color = body.color;
    if ('archived' in body || 'status' in body) {
      const archived = body.archived === true || body.archived === 1 || body.status === 'archived';
      fields.status = archived ? 'archived' : 'active';
      fields.archived = archived ? 1 : 0;
    }
    if (!Object.keys(fields).length || ('name' in fields && !fields.name)) return json({ error: 'Valid changes are required.' }, 400);
    if ('parent_id' in fields) {
      const parentError = await metadataParentError(env, fields.parent_id, item.projectId, item.type);
      if (parentError) return json({ error: parentError }, 400);
    }
    let result;
    try { result = await env.DB.prepare(`UPDATE project_metadata SET ${Object.keys(fields).map(key => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...Object.values(fields), metadataMatch[1]).run(); } catch (error) { if (/UNIQUE constraint failed/i.test(error.message)) return json({ error: 'That item already exists in this project.' }, 409); throw error; }
    if (result.meta.changes) await notifyUsers(env, user.id, { projectId: item.projectId, type: 'metadata_updated', title: fields.status === 'archived' ? 'Metadata archived' : 'Metadata updated', body: user.name + ' updated a metadata item' });
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Metadata not found.' }, 404);
  }
  if (request.method === 'DELETE' && metadataMatch) {
    const item = await env.DB.prepare('SELECT project_id AS projectId FROM project_metadata WHERE id=?').bind(metadataMatch[1]).first();
    if (!item) return json({ error: 'Metadata not found.' }, 404);
    if (!await requireProject(env, user, item.projectId, 'edit')) return accessDenied();
    const result = await env.DB.prepare('DELETE FROM project_metadata WHERE id = ?').bind(metadataMatch[1]).run();
    if (result.meta.changes) await notifyUsers(env, user.id, { projectId: item.projectId, type: 'metadata_deleted', title: 'Metadata deleted', body: user.name + ' permanently deleted a metadata item' });
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Metadata not found.' }, 404);
  }
  if (request.method === 'POST' && path === '/api/admin/users') {
    if (user.role !== 'super_admin') return json({ error: 'Super admin access required.' }, 403);
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const email = safeText(body.email, 254).toLowerCase(); const name = safeText(body.name, 80); const password = typeof body.password === 'string' ? body.password : '';
    const username = safeText(body.username, 40).toLowerCase() || email.split('@')[0].replace(/[^a-z0-9_-]/g, '');
    if (!/^\S+@\S+\.\S+$/.test(email) || !name || !/^[a-z0-9_-]{3,40}$/.test(username) || password.length < MIN_PASSWORD_LENGTH || password.length > 128) return json({ error: `Name, valid email, username, and a password of ${MIN_PASSWORD_LENGTH}–128 characters are required.` }, 400);
    if (await env.DB.prepare('SELECT id FROM users WHERE email = ? OR username = ?').bind(email, username).first()) return json({ error: 'An account with that email or username already exists.' }, 409);
    const admin = { id: id(), email, username, name, role: 'admin' };
    await env.DB.prepare('INSERT INTO users (id, email, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)').bind(admin.id, email, username, name, await passwordHash(password), admin.role).run();
    return json(admin, 201);
  }
  const adminMatch = path.match(/^\/api\/admin\/users\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && adminMatch) {
    if (user.role !== 'super_admin') return json({ error: 'Super admin access required.' }, 403);
    const body = await readBody(request); const role = body?.role;
    if (!['admin', 'member', 'super_admin'].includes(role)) return json({ error: 'Invalid role.' }, 400);
    if (adminMatch[1] === user.id && role !== 'super_admin') return json({ error: 'You cannot remove your own super admin access.' }, 400);
    const result = await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, adminMatch[1]).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'User not found.' }, 404);
  }
  if (request.method === 'DELETE' && adminMatch) {
    if (user.role !== 'super_admin') return json({ error: 'Super admin access required.' }, 403);
    if (adminMatch[1] === user.id) return json({ error: 'You cannot delete your own account.' }, 400);
    const result = await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(adminMatch[1]).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'User not found.' }, 404);
  }
  if (request.method === 'GET' && path === '/api/bootstrap') return json(await bootstrap(env, user.id, new URL(request.url).searchParams.get('project')));

  if (request.method === 'GET' && path === '/api/project-settings') {
    const settings = await env.DB.prepare("SELECT name, description, access_mode AS accessMode FROM project_settings WHERE id = 'default'").first();
    return json(settings || { name: 'Acme Redesign', description: '', accessMode: 'link' });
  }
  if (request.method === 'GET' && path === '/api/spaces') {
    const result = await env.DB.prepare('SELECT s.id, s.name, s.key, s.description, COUNT(p.id) AS projectCount FROM spaces s LEFT JOIN projects p ON p.space_id = s.id GROUP BY s.id ORDER BY s.name').all();
    return json({ spaces: result.results });
  }
  if (request.method === 'POST' && path === '/api/projects') {
    if (!await canCreateProject(env, user)) return json({ error: 'Project creation is not available for this account.' }, 403);
    const body = await readBody(request); const name = safeText(body?.name, 120); if (!name) return json({ error: 'Project name is required.' }, 400);
    const project = { id: id(), name, description: safeText(body.description, 2000), spaceId: safeText(body.spaceId, 80) || 'default', accessMode: 'invite',createdBy:user.id };
    try { await env.DB.batch([env.DB.prepare('INSERT INTO projects (id, space_id, name, description, access_mode,created_by) VALUES (?, ?, ?, ?, ?, ?)').bind(project.id, project.spaceId, project.name, project.description, project.accessMode,user.id), env.DB.prepare("INSERT INTO project_memberships (project_id, user_id, role) VALUES (?, ?, 'editor')").bind(project.id, user.id)]); await notifyUsers(env, user.id, { projectId: project.id, type: 'project_created', title: 'Project created', body: user.name + ' created ' + project.name }); return json(project, 201); } catch { return json({ error: 'Space or project already exists.' }, 409); }
  }
  const projectMatch = path.match(/^\/api\/projects\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'DELETE' && projectMatch) {
    if (!await canManageProject(env,user,projectMatch[1])) return json({ error:'Project owner or admin access required.' },403);
    if (projectMatch[1] === 'default') return json({ error: 'The default project is protected.' }, 400);
    const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectMatch[1]).first();
    if (!project) return json({ error: 'Project not found.' }, 404);
    if (await activeProjectCapture(env,projectMatch[1])) return json({error:'Stop and sync all meeting bots before deleting this project.'},409);
    const attachments = await env.DB.prepare('SELECT object_key AS objectKey FROM review_attachments WHERE review_id IN (SELECT id FROM reviews WHERE project_id = ?)').bind(projectMatch[1]).all();
    await env.DB.batch([
      ...attachments.results.map(item => cleanupStatement(env,item.objectKey)),
      env.DB.prepare('DELETE FROM notifications WHERE review_id IN (SELECT id FROM reviews WHERE project_id = ?)').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM review_comments WHERE review_id IN (SELECT id FROM reviews WHERE project_id = ?)').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM review_activity WHERE review_id IN (SELECT id FROM reviews WHERE project_id = ?)').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM review_status_history WHERE review_id IN (SELECT id FROM reviews WHERE project_id = ?)').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM review_subtasks WHERE review_id IN (SELECT id FROM reviews WHERE project_id = ?)').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM review_attachments WHERE review_id IN (SELECT id FROM reviews WHERE project_id = ?)').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM reviews WHERE project_id = ?').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM meetings WHERE project_id = ?').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM workflow_statuses WHERE project_id = ?').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM sprints WHERE project_id = ?').bind(projectMatch[1]),
      env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(projectMatch[1])
    ]);
    await drainFileCleanup(env).catch(() => recordOperationalEvent(env,'maintenance','cleanup_retry'));
    await notifyUsers(env, user.id, { type: 'project_deleted', title: 'Project deleted', body: user.name + ' deleted a project and its workspace data' });
    return json({ ok: true });
  }
  if (request.method === 'PATCH' && projectMatch) {
    if (!await canManageProject(env,user,projectMatch[1])) return json({ error:'Project owner or admin access required.' },403);
    const body = await readBody(request); const fields = {}; if ('name' in (body || {})) fields.name = safeText(body.name, 120); if ('description' in (body || {})) fields.description = safeText(body.description, 2000);
    if ('name' in fields && !fields.name) return json({ error: 'Project name is required.' }, 400);
    if ('accessMode' in (body || {})) { if (!['invite', 'link'].includes(body.accessMode)) return json({ error: 'Invalid access mode.' }, 400); fields.access_mode = body.accessMode; }
    if (!Object.keys(fields).length) return json({ error: 'No changes supplied.' }, 400);
    const result = await env.DB.prepare(`UPDATE projects SET ${Object.keys(fields).map(key => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...Object.values(fields), projectMatch[1]).run(); return result.meta.changes ? json({ ok: true }) : json({ error: 'Project not found.' }, 404);
  }
  if (request.method === 'PATCH' && path === '/api/project-settings') {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const name = safeText(body.name, 120); const description = safeText(body.description, 2000); const accessMode = body.accessMode;
    if (!name) return json({ error: 'Project name is required.' }, 400);
    if (!['invite', 'link'].includes(accessMode)) return json({ error: 'Invalid access mode.' }, 400);
    await env.DB.prepare("INSERT INTO project_settings (id, name, description, access_mode) VALUES ('default', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, access_mode = excluded.access_mode, updated_at = CURRENT_TIMESTAMP").bind(name, description, accessMode).run();
    await env.DB.prepare("UPDATE projects SET name = ?, description = ?, access_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'default'").bind(name, description, accessMode).run();
    await notifyUsers(env, user.id, { projectId: 'default', type: 'project_updated', title: 'Project settings updated', body: user.name + ' updated project settings' });
    return json({ name, description, accessMode, initials: name.slice(0, 1).toUpperCase() });
  }
  if (request.method === 'GET' && path === '/api/notifications') {
    const result = await env.DB.prepare("SELECT n.id, n.type, n.title, n.body, n.read_at AS readAt, n.created_at AS createdAt, n.review_id AS reviewId, n.project_id AS projectId FROM notifications n WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50").bind(user.id).all();
    const allowed = await Promise.all(result.results.map(async item => !item.projectId || await canAccessProject(env, user, item.projectId)));
    return json({ notifications: result.results.filter((_, index) => allowed[index]).map(item => ({ ...item, read: Boolean(item.readAt) })) });
  }
  const notificationMatch = path.match(/^\/api\/notifications\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && notificationMatch) {
    const result = await env.DB.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(notificationMatch[1], user.id).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Notification not found.' }, 404);
  }
  if (request.method === 'POST' && path === '/api/notifications/read-all') {
    await env.DB.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL').bind(user.id).run();
    return json({ ok: true });
  }
  if (request.method === 'GET' && path === '/api/reports/burndown') {
    // Burndown for one sprint: remaining open tasks per day vs ideal line.
    // resolvedAt = earliest status_history move to Resolved, else updated_at when already resolved.
    const sprintId = new URL(request.url).searchParams.get('sprint_id') || '';
    if (!sprintId) return json({ error: 'sprint_id is required.' }, 400);
    const sprint = await env.DB.prepare('SELECT id, project_id AS projectId, name, start_date AS startDate, end_date AS endDate, status FROM sprints WHERE id = ?').bind(sprintId).first();
    if (!sprint) return json({ error: 'Sprint not found.' }, 404);
    const sprintProject = await env.DB.prepare('SELECT project_id AS projectId FROM sprints WHERE id = ?').bind(sprintId).first();
    if (!await requireProject(env, user, sprintProject?.projectId, 'view')) return accessDenied();
    const tasks = await env.DB.prepare("SELECT id, created_at AS createdAt, updated_at AS updatedAt, stage, status, archived FROM reviews WHERE project_id=? AND archived = 0 AND (sprint_id = ? OR ((sprint_id IS NULL OR sprint_id='') AND sprint = ?))").bind(sprint.projectId, sprint.id, sprint.name).all();
    const ids = tasks.results.map(t => t.id);
    let resolvedAt = {};
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const history = await env.DB.prepare(`SELECT review_id AS reviewId, MIN(created_at) AS resolvedAt FROM review_status_history WHERE to_status = 'Resolved' AND review_id IN (${placeholders}) GROUP BY review_id`).bind(...ids).all();
      resolvedAt = Object.fromEntries(history.results.map(h => [h.reviewId, h.resolvedAt.slice(0, 10)]));
    }
    const isResolved = t => t.status === 'Resolved' || t.stage === 'Completed';
    const doneDate = t => resolvedAt[t.id] || (isResolved(t) ? t.updatedAt.slice(0, 10) : null);
    const start = sprint.startDate || tasks.results.map(t => t.createdAt.slice(0, 10)).sort()[0] || new Date().toISOString().slice(0, 10);
    const end = sprint.endDate || new Date().toISOString().slice(0, 10);
    const days = [];
    for (let d = new Date(`${start}T12:00:00`); d <= new Date(`${end}T12:00:00`); d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10));
    const total = tasks.results.length;
    const series = days.map((date, index) => {
      const remaining = tasks.results.filter(t => t.createdAt.slice(0, 10) <= date && !(doneDate(t) && doneDate(t) <= date)).length;
      const ideal = days.length > 1 ? total * (1 - index / (days.length - 1)) : total;
      return { date, remaining, ideal: Math.round(ideal * 10) / 10 };
    });
    return json({ sprint, total, days: series });
  }

  if (request.method === 'GET' && path === '/api/workflow/statuses') {
    const result = await env.DB.prepare('SELECT id, project_id AS projectId, name, color, position, is_terminal AS isTerminal FROM workflow_statuses ORDER BY position').all();
    const visible = await visibleProjectRows(env, user, result.results);
    return json({ statuses: visible.map(item => ({ ...item, isTerminal: Boolean(item.isTerminal) })) });
  }
  if (request.method === 'POST' && path === '/api/workflow/statuses') {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); const name = safeText(body?.name, 80); if (!name) return json({ error: 'Status name is required.' }, 400);
    const item = { id: id(), name, color: safeText(body.color, 20) || '#64748b', position: Number(body.position || 99), isTerminal: body.isTerminal ? 1 : 0 };
    try { await env.DB.prepare('INSERT INTO workflow_statuses (id, project_id, name, color, position, is_terminal) VALUES (?, ?, ?, ?, ?, ?)').bind(item.id, 'default', item.name, item.color, item.position, item.isTerminal).run(); return json(item, 201); } catch { return json({ error: 'Status already exists.' }, 409); }
  }
  const workflowStatusMatch = path.match(/^\/api\/workflow\/statuses\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && workflowStatusMatch) {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); const fields = {}; if ('name' in (body || {})) fields.name = safeText(body.name, 80); if ('color' in (body || {})) fields.color = safeText(body.color, 20); if ('position' in (body || {})) fields.position = Number(body.position); if ('isTerminal' in (body || {})) fields.is_terminal = body.isTerminal ? 1 : 0;
    if (!Object.keys(fields).length) return json({ error: 'No changes supplied.' }, 400);
    try { const result = await env.DB.prepare(`UPDATE workflow_statuses SET ${Object.keys(fields).map(key => `${key} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(fields), workflowStatusMatch[1]).run(); return result.meta.changes ? json({ ok: true }) : json({ error: 'Status not found.' }, 404); } catch { return json({ error: 'Status name already exists.' }, 409); }
  }
  if (request.method === 'DELETE' && path.startsWith('/api/workflow/statuses/')) {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const statusId = path.split('/').pop(); const inUse = await env.DB.prepare('SELECT COUNT(*) AS count FROM reviews WHERE stage = (SELECT name FROM workflow_statuses WHERE id = ?)').bind(statusId).first('count');
    if (Number(inUse) > 0) return json({ error: 'Status is in use by tasks.' }, 409);
    await env.DB.prepare('DELETE FROM workflow_statuses WHERE id = ?').bind(statusId).run(); return json({ ok: true });
  }
  if (request.method === 'GET' && path === '/api/workflow/sprints') {
    const result = await env.DB.prepare('SELECT id, project_id AS projectId, name, goal, start_date AS startDate, end_date AS endDate, status FROM sprints ORDER BY start_date DESC').all();
    return json({ sprints: await visibleProjectRows(env, user, result.results) });
  }
  if (request.method === 'POST' && path === '/api/workflow/sprints') {
    const body = await readBody(request); const name = safeText(body?.name, 100); if (!name) return json({ error: 'Sprint name is required.' }, 400);
    const projectId = safeText(body.projectId, 80) || 'default';
    if (!await requireProject(env, user, projectId, 'edit')) return accessDenied();
    if (!await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first()) return json({ error: 'Project not found.' }, 400);
    const item = { id: id(), projectId, name, goal: safeText(body.goal, 500), startDate: null, endDate: null, status: ['planned','active','completed'].includes(body.status) ? body.status : 'planned' };
    try {
      item.startDate = calendarDate(body.startDate, 'Sprint start date');
      item.endDate = calendarDate(body.endDate, 'Sprint end date');
      dateRange(item.startDate, item.endDate, 'Sprint end date');
      if (body.status && !['planned','active','completed'].includes(body.status)) throw new Error('Invalid sprint status.');
    } catch (error) { return json({ error: error.message }, 400); }
    try { await env.DB.prepare('INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(item.id, item.projectId, item.name, item.goal, item.startDate, item.endDate, item.status).run(); await notifyUsers(env, user.id, { projectId: item.projectId, type: 'sprint_created', title: 'Sprint created', body: user.name + ' created ' + item.name }); return json(item, 201); } catch { return json({ error: 'Sprint already exists.' }, 409); }
  }
  const sprintMatch = path.match(/^\/api\/workflow\/sprints\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && sprintMatch) {
    const item = await env.DB.prepare('SELECT project_id AS projectId, start_date AS startDate, end_date AS endDate FROM sprints WHERE id=?').bind(sprintMatch[1]).first();
    if (!item) return json({ error: 'Sprint not found.' }, 404);
    if (!await requireProject(env, user, item.projectId, 'edit')) return accessDenied();
    const body = await readBody(request) || {};
    const fields = {};
    if ('name' in body) { fields.name = safeText(body.name, 100); if (!fields.name) return json({ error: 'Sprint name is required.' }, 400); }
    if ('goal' in body) fields.goal = safeText(body.goal, 500);
    try {
      if ('startDate' in body) fields.start_date = calendarDate(body.startDate, 'Sprint start date');
      if ('endDate' in body) fields.end_date = calendarDate(body.endDate, 'Sprint end date');
      dateRange('start_date' in fields ? fields.start_date : item.startDate, 'end_date' in fields ? fields.end_date : item.endDate, 'Sprint end date');
      if ('status' in body) {
        if (!['planned','active','completed'].includes(body.status)) throw new Error('Invalid sprint status.');
        fields.status = body.status;
      }
    } catch (error) { return json({ error: error.message }, 400); }
    if (!Object.keys(fields).length) return json({ error: 'No changes supplied.' }, 400);
    let result;
    try { result = await env.DB.prepare(`UPDATE sprints SET ${Object.keys(fields).map(key => `${key} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(fields), sprintMatch[1]).run(); }
    catch (error) { if (/UNIQUE constraint/i.test(error.message)) return json({ error: 'Sprint already exists.' }, 409); throw error; }
    if (!result.meta.changes) return json({ error: 'Sprint not found.' }, 404);
    const saved = await env.DB.prepare('SELECT id, project_id AS projectId, name, goal, start_date AS startDate, end_date AS endDate, status FROM sprints WHERE id = ?').bind(sprintMatch[1]).first();
    await notifyUsers(env, user.id, { projectId: saved.projectId, type: 'sprint_updated', title: 'Sprint updated', body: user.name + ' updated ' + (saved?.name || 'a sprint') });
    return json(saved);
  }

  if (request.method === 'POST' && path === '/api/reviews') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    try {
      const review = normalizeReview(body);
      const reviewId = body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id();
      if (!await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(review.project_id || 'default').first()) return json({ error: 'Project not found.' }, 400);
      if (!await requireProject(env, user, review.project_id, 'edit')) return accessDenied();
      const relationError = await validateRelations(env, review, review.project_id);
      if (relationError) return json({ error: relationError }, 400);
      const base = { id: reviewId, ...review, submitted_by: review.submitted_by || user.name, archived: 0 };
      const receipt = await creationReceipt(env,user,'task',reviewId,review);
      if (receipt.response) return receipt.response;
      if (receipt.replay) {
        const saved = await reviewSnapshot(env,reviewId);
        return saved ? json({ ...saved,labels:parseJson(saved.labels,[]),assignees:parseJson(saved.assignees,[]) },201) : json({ error:'This task has been deleted. Create it with a new ID.' },410);
      }
      const insertRow = key => env.DB.batch([receipt.statement,env.DB.prepare('INSERT INTO reviews (id, key, title, area, priority, stage, assignee, assignees, due, start_date, description, status, submitted_by, meeting_id, reporter, estimate_hours, epic, feature, sprint, labels, project_id, parent_id, item_type, sprint_id, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(base.id, key, base.title, base.area, base.priority, base.stage, base.assignee, base.assignees ?? JSON.stringify(base.assignee ? [base.assignee] : []), base.due, base.start_date ?? null, base.description, base.status, base.submitted_by, base.meeting_id, base.reporter || user.name, base.estimate_hours ?? null, base.epic || '', base.feature || '', base.sprint || '', base.labels || '[]', base.project_id || 'default', base.parent_id || null, base.item_type || 'task', base.sprint_id || null, base.archived),env.DB.prepare('INSERT INTO review_status_history(id,review_id,from_status,to_status,user_id) VALUES(?,?,?,?,?)').bind(id(),base.id,null,base.status,user.id),env.DB.prepare('INSERT INTO review_activity(id,review_id,user_id,action,metadata) VALUES(?,?,?,?,?)').bind(id(),base.id,user.id,'created',JSON.stringify({title:base.title}))]);
      // Retry on key collision: MAX()+1 races under concurrency, key is UNIQUE.
      let lastError = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const maxKey = await env.DB.prepare("SELECT MAX(CAST(SUBSTR(key, INSTR(key, '-') + 1) AS INTEGER)) AS maxKey FROM reviews WHERE key LIKE 'AR-%'").first('maxKey');
        try {
          await insertRow(`AR-${(maxKey || 0) + 1 + attempt}`);
          lastError = null;
          break;
        } catch (error) {
          if (!String(error?.message || '').toLowerCase().includes('unique')) throw error;
          const raced=await creationReceipt(env,user,'task',reviewId,review);
          if(raced.response)return raced.response;
          if(raced.replay){const saved=await reviewSnapshot(env,reviewId);return saved?json({...saved,labels:parseJson(saved.labels,[]),assignees:parseJson(saved.assignees,[])},201):json({error:'This task was deleted. Use a new creation ID.'},410);}
          lastError = error;
        }
      }
      if (lastError) return json({ error: 'Could not assign a task key, please retry.' }, 409);
      await recordActivity(env, base.id, user.id, 'created', { title: base.title },true).catch(()=>recordOperationalEvent(env,'api','activity_delivery_failed'));
      const saved = await reviewSnapshot(env, base.id);
      return json({ ...saved, labels: parseJson(saved.labels, []), assignees: parseJson(saved.assignees, []) }, 201);
    } catch (error) { return json({ error: error.message }, 400); }
  }

  const detailsMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/details$/);
  if (request.method === 'GET' && detailsMatch) {
    if (!await requireProject(env, user, await projectIdForReview(env, detailsMatch[1]), 'view')) return accessDenied();
    const review = await reviewSnapshot(env, detailsMatch[1]);
    if (!review) return json({ error: 'Review not found.' }, 404);
    const [comments, activity, meeting, subtasks, history, children, attachments] = await env.DB.batch([
      env.DB.prepare('SELECT c.id, c.body, c.created_at AS createdAt, u.name, u.email FROM review_comments c JOIN users u ON u.id = c.user_id WHERE c.review_id = ? ORDER BY c.created_at ASC').bind(detailsMatch[1]),
      env.DB.prepare('SELECT a.id, a.action, a.metadata, a.created_at AS createdAt, u.name, u.email FROM review_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.review_id = ? ORDER BY a.created_at DESC').bind(detailsMatch[1]),
      env.DB.prepare('SELECT id, title, date, notes, (SELECT COUNT(*) FROM reviews WHERE meeting_id = m.id AND archived = 0) AS itemCount FROM meetings m WHERE id = (SELECT meeting_id FROM reviews WHERE id = ?)').bind(detailsMatch[1]),
      env.DB.prepare('SELECT id, title, completed, created_at AS createdAt, updated_at AS updatedAt FROM review_subtasks WHERE review_id = ? ORDER BY created_at ASC').bind(detailsMatch[1]),
      env.DB.prepare('SELECT h.id, h.from_status AS fromStatus, h.to_status AS toStatus, h.created_at AS createdAt, u.name FROM review_status_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.review_id = ? ORDER BY h.created_at DESC').bind(detailsMatch[1]),
      env.DB.prepare('SELECT id, title, item_type AS itemType, stage, status FROM reviews WHERE parent_id = ? AND archived = 0 ORDER BY created_at ASC').bind(detailsMatch[1]),
      env.DB.prepare('SELECT id, filename, content_type AS contentType, size, created_at AS createdAt FROM review_attachments WHERE review_id = ? ORDER BY created_at DESC').bind(detailsMatch[1])
    ]);
    return json({ review: { ...review, labels: parseJson(review.labels, []), assignees: parseJson(review.assignees, []) }, meeting: meeting.results[0] || null, comments: comments.results, subtasks: subtasks.results.map(item => ({ ...item, completed: Boolean(item.completed) })), history: history.results, children: children.results, attachments: attachments.results, activity: activity.results.map(item => ({ ...item, metadata: parseJson(item.metadata, {}) })) });
  }
  const commentMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/comments$/);
  if (request.method === 'POST' && commentMatch) {
    if (!await requireProject(env, user, await projectIdForReview(env, commentMatch[1]), 'edit')) return accessDenied();
    const body = await readBody(request); const text = safeText(body?.body, 2000);
    if (!text) return json({ error: 'Comment cannot be empty.' }, 400);
    const comment = { id: id(), body: text, createdAt: new Date().toISOString() };
    const exists = await env.DB.prepare('SELECT id FROM reviews WHERE id = ?').bind(commentMatch[1]).first();
    if (!exists) return json({ error: 'Review not found.' }, 404);
    await env.DB.prepare('INSERT INTO review_comments (id, review_id, user_id, body) VALUES (?, ?, ?, ?)').bind(comment.id, commentMatch[1], user.id, text).run();
    await recordActivity(env, commentMatch[1], user.id, 'commented', {});
    await notifyMentions(env,await projectIdForReview(env,commentMatch[1]),commentMatch[1],user.id,text);
    return json({ ...comment, name: user.name, email: user.email }, 201);
  }
  const reviewMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && reviewMatch) {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    try {
      const before = await reviewSnapshot(env, reviewMatch[1]);
      if (!before) return json({ error: 'Review not found.' }, 404);
      if (!await requireProject(env, user, before.projectId, 'edit')) return accessDenied();
      const patch = normalizeReview(body, true); const keys = Object.keys(patch);
      if (!keys.length) return json({ error: 'No changes supplied.' }, 400);
      if ('project_id' in patch && patch.project_id !== before.projectId) return json({ error: 'Moving tasks between projects is not supported.' }, 400);
      const relationError = await validateRelations(env, { meeting_id: before.meetingId, parent_id: before.parentId, sprint_id: before.sprintId, start_date: before.startDate, due: before.due, ...patch }, before.projectId, reviewMatch[1]);
      if (relationError) return json({ error: relationError }, 400);
      const values = keys.map(key => patch[key]);
      const aliases = { start_date:'startDate',submitted_by:'submittedBy',meeting_id:'meetingId',estimate_hours:'estimateHours',project_id:'projectId',parent_id:'parentId',item_type:'itemType',sprint_id:'sprintId' };
      const changes = Object.fromEntries(keys.map(key => [key, { from:before[aliases[key] || key],to:patch[key] }]).filter(([,change]) => change.from !== change.to));
      const changedKeys=Object.keys(changes);
      if(!changedKeys.length)return json({ ...before,labels:parseJson(before.labels,[]),assignees:parseJson(before.assignees,[]) });
      const metadata={fields:changedKeys,changes};
      // Compare changed fields and persist audit/history in the same transaction.
      // changes() refers to the immediately preceding statement in this batch.
      const statements=[
        env.DB.prepare(`UPDATE reviews SET ${keys.map(key=>`${key} = ?`).join(', ')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${keys.map(key=>`${key} IS ?`).join(' AND ')}`).bind(...values,reviewMatch[1],...keys.map(key=>before[aliases[key] || key] ?? null)),
        env.DB.prepare('INSERT INTO review_activity(id,review_id,user_id,action,metadata) SELECT ?,?,?,?,? WHERE changes()=1').bind(id(),reviewMatch[1],user.id,'updated',JSON.stringify(metadata))
      ];
      if('status' in changes)statements.push(env.DB.prepare('INSERT INTO review_status_history(id,review_id,from_status,to_status,user_id) SELECT ?,?,?,?,? WHERE changes()=1').bind(id(),reviewMatch[1],before.status,patch.status,user.id));
      const result=await env.DB.batch(statements);
      if(!result[0].meta.changes)return json({ error:'This task changed while you were editing it. Reload its details and try again.' },409);
      const saved = await reviewSnapshot(env, reviewMatch[1]);
      await recordActivity(env, reviewMatch[1], user.id, 'updated', metadata,true).catch(()=>recordOperationalEvent(env,'api','activity_delivery_failed'));
      return json({ ...saved, labels: parseJson(saved.labels, []), assignees: parseJson(saved.assignees, []) });
    } catch (error) { return json({ error: error.message }, 400); }
  }

  if (request.method === 'DELETE' && reviewMatch) {
    if (!await requireProject(env, user, await projectIdForReview(env, reviewMatch[1]), 'edit')) return accessDenied();
    const doomed = await env.DB.prepare('SELECT title, project_id AS projectId FROM reviews WHERE id = ?').bind(reviewMatch[1]).first();
    const attachments = await env.DB.prepare('SELECT object_key AS objectKey FROM review_attachments WHERE review_id = ?').bind(reviewMatch[1]).all();
    const deletion = await env.DB.batch([...attachments.results.map(item => cleanupStatement(env,item.objectKey)),env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(reviewMatch[1])]);
    const result = deletion[deletion.length-1];
    await drainFileCleanup(env).catch(() => recordOperationalEvent(env,'maintenance','cleanup_retry'));
    if (result.meta.changes && doomed) await notifyUsers(env, user.id, { projectId: doomed.projectId, type: 'review_deleted', title: 'Task deleted', body: user.name + ' deleted "' + doomed.title + '"' });
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Review not found.' }, 404);
  }

  const subtasksPostMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/subtasks$/);
  if (request.method === 'POST' && subtasksPostMatch) {
    if (!await requireProject(env, user, await projectIdForReview(env, subtasksPostMatch[1]), 'edit')) return accessDenied();
    const body = await readBody(request); const title = safeText(body?.title, 240);
    if (!title) return json({ error: 'Subtask title is required.' }, 400);
    if (!await env.DB.prepare('SELECT id FROM reviews WHERE id = ?').bind(subtasksPostMatch[1]).first()) return json({ error: 'Review not found.' }, 404);
    const subtask = { id: id(), title, completed: 0 };
    await env.DB.prepare('INSERT INTO review_subtasks (id, review_id, title, completed) VALUES (?, ?, ?, 0)').bind(subtask.id, subtasksPostMatch[1], title).run();
    await recordActivity(env, subtasksPostMatch[1], user.id, 'subtask_added', { title });
    return json(subtask, 201);
  }
  const subtaskMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/subtasks\/([a-zA-Z0-9-]+)$/);
  if (subtaskMatch && request.method === 'PATCH') {
    if (!await requireProject(env, user, await projectIdForReview(env, subtaskMatch[1]), 'edit')) return accessDenied();
    const body = await readBody(request); const patch = {};
    if ('title' in (body || {})) { patch.title = safeText(body.title, 240); if (!patch.title) return json({ error: 'Subtask title is required.' }, 400); }
    if ('completed' in (body || {})) patch.completed = body.completed ? 1 : 0;
    if (!Object.keys(patch).length) return json({ error: 'No changes supplied.' }, 400);
    const keys = Object.keys(patch); const result = await env.DB.prepare(`UPDATE review_subtasks SET ${keys.map(key => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND review_id = ?`).bind(...keys.map(key => patch[key]), subtaskMatch[2], subtaskMatch[1]).run();
    if (result.meta.changes) await recordActivity(env, subtaskMatch[1], user.id, 'subtask_updated', { fields: keys });
    return result.meta.changes ? json({ ...patch, id: subtaskMatch[2], completed: Boolean(patch.completed) }) : json({ error: 'Subtask not found.' }, 404);
  }
  if (subtaskMatch && request.method === 'DELETE') {
    if (!await requireProject(env, user, await projectIdForReview(env, subtaskMatch[1]), 'edit')) return accessDenied();
    const result = await env.DB.prepare('DELETE FROM review_subtasks WHERE id = ? AND review_id = ?').bind(subtaskMatch[2], subtaskMatch[1]).run();
    if (result.meta.changes) await recordActivity(env, subtaskMatch[1], user.id, 'subtask_removed', {});
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Subtask not found.' }, 404);
  }

  const attachmentPostMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/attachments$/);
  if (request.method === 'POST' && attachmentPostMatch) {
    if (!await requireProject(env, user, await projectIdForReview(env, attachmentPostMatch[1]), 'edit')) return accessDenied();
    if (!env.ATTACHMENTS) return json({ error: 'R2 attachments are not configured.' }, 503);
    let form;
    try { form = await request.formData(); } catch { return json({ error: 'Choose a file using multipart form data.' }, 400); }
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return json({ error: 'Choose a file to upload.' }, 400);
    if (file.size > MAX_ATTACHMENT_BYTES) return json({ error: 'Files must be 50 MB or smaller.' }, 413);
    if (!await env.DB.prepare('SELECT id FROM reviews WHERE id = ?').bind(attachmentPostMatch[1]).first()) return json({ error: 'Review not found.' }, 404);
    const filename = safeText(file.name, 180) || 'attachment'; const key = `${attachmentPostMatch[1]}/${id()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    // Reserve cleanup before R2 upload: a process failure cannot leave an
    // untracked object. Successful linking cancels cleanup atomically.
    await cleanupStatement(env,key,3600).run();
    await env.ATTACHMENTS.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
    const item = { id: id(), filename, contentType: file.type || 'application/octet-stream', size: file.size };
    await env.DB.batch([
      env.DB.prepare('INSERT INTO review_attachments (id, review_id, user_id, object_key, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(item.id, attachmentPostMatch[1], user.id, key, item.filename, item.contentType, item.size),
      env.DB.prepare('DELETE FROM file_cleanup WHERE object_key=?').bind(key)
    ]);
    await recordActivity(env, attachmentPostMatch[1], user.id, 'attachment_added', { filename });
    return json(item, 201);
  }
  const attachmentMatch = path.match(/^\/api\/attachments\/([a-zA-Z0-9-]+)$/);
  if (attachmentMatch && request.method === 'GET') {
    if (!env.ATTACHMENTS) return json({ error: 'R2 attachments are not configured.' }, 503);
    const item = await env.DB.prepare('SELECT object_key AS objectKey, filename, content_type AS contentType, review_id AS reviewId FROM review_attachments WHERE id = ?').bind(attachmentMatch[1]).first();
    if (!item) return json({ error: 'Attachment not found.' }, 404); if (!await requireProject(env, user, await projectIdForReview(env, item.reviewId), 'view')) return accessDenied(); const object = await env.ATTACHMENTS.get(item.objectKey);
    if (!object) return json({ error: 'Attachment object not found.' }, 404);
    return new Response(object.body, { headers: { 'content-type': item.contentType, 'content-disposition': `attachment; filename="${item.filename.replace(/"/g, '')}"`, 'cache-control': 'no-store' } });
  }
  if (attachmentMatch && request.method === 'DELETE') {
    if (!env.ATTACHMENTS) return json({ error: 'R2 attachments are not configured.' }, 503);
    const item = await env.DB.prepare('SELECT object_key AS objectKey, review_id AS reviewId FROM review_attachments WHERE id = ?').bind(attachmentMatch[1]).first();
    if (!item) return json({ error: 'Attachment not found.' }, 404); if (!await requireProject(env, user, await projectIdForReview(env, item.reviewId), 'edit')) return accessDenied();
    await env.DB.batch([cleanupStatement(env,item.objectKey),env.DB.prepare('DELETE FROM review_attachments WHERE id = ?').bind(attachmentMatch[1])]);
    await drainFileCleanup(env).catch(() => recordOperationalEvent(env,'maintenance','cleanup_retry')); await recordActivity(env, item.reviewId, user.id, 'attachment_removed', {}); return json({ ok: true });
  }

  if (request.method === 'POST' && path === '/api/meetings') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const title = safeText(body.title);
    let date;
    try { date = calendarDate(body.date, 'Meeting date', true); } catch (error) { return json({ error: error.message }, 400); }
    if (!title || !date) return json({ error: 'Meeting title and date are required.' }, 400);
    const meeting = { id: body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id(), title, date, projectId: safeText(body.projectId, 80) || 'default', notes: safeText(body.notes, 5000), ai: body.ai ? 1 : 0, itemCount: 0, attendees: Array.isArray(body.attendees) ? body.attendees.map(x => safeText(x, 120)).filter(Boolean).slice(0, 30) : [] };
    if (!await requireProject(env, user, meeting.projectId, 'edit')) return accessDenied();
    if (!await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(meeting.projectId).first()) return json({ error: 'Project not found.' }, 400);
    const receipt = await creationReceipt(env,user,'meeting',meeting.id,meeting);
    if (receipt.response) return receipt.response;
    if (receipt.replay) {
      const saved = await env.DB.prepare('SELECT id,title,date,ai,notes,project_id AS projectId,attendees FROM meetings WHERE id=?').bind(meeting.id).first();
      return saved ? json({ ...saved,ai:!!saved.ai,attendees:parseJson(saved.attendees,[]) },201) : json({ error:'This meeting has been deleted. Create it with a new ID.' },410);
    }
    try {
    await env.DB.batch([receipt.statement,env.DB.prepare('INSERT INTO meetings (id, project_id, title, date, ai, notes, item_count, attendees) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(meeting.id, meeting.projectId, meeting.title, meeting.date, meeting.ai, meeting.notes, meeting.itemCount, JSON.stringify(meeting.attendees))]);
    } catch(error) {
      const raced=await creationReceipt(env,user,'meeting',meeting.id,meeting);
      if(raced.response)return raced.response;
      if(!raced.replay)throw error;
      const saved=await env.DB.prepare('SELECT id,title,date,ai,notes,project_id AS projectId,attendees FROM meetings WHERE id=?').bind(meeting.id).first();
      return saved?json({...saved,ai:!!saved.ai,attendees:parseJson(saved.attendees,[])},201):json({error:'This meeting was deleted. Use a new creation ID.'},410);
    }
    await notifyUsers(env, user.id, { projectId: meeting.projectId, type: 'meeting_created', title: 'New meeting scheduled', body: `"${meeting.title}" on ${meeting.date}` });
    return json({ ...meeting, ai: Boolean(meeting.ai) }, 201);
  }

  const meetingMatch = path.match(/^\/api\/meetings\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && meetingMatch) {
    const meetingProject = await env.DB.prepare('SELECT project_id AS projectId FROM meetings WHERE id = ?').bind(meetingMatch[1]).first();
    if (!meetingProject) return json({ error: 'Meeting not found.' }, 404);
    if (!await requireProject(env, user, meetingProject.projectId, 'edit')) return accessDenied();
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const patch = {};
    if ('title' in body) { patch.title = safeText(body.title, 200); if (!patch.title) return json({ error: 'Meeting title is required.' }, 400); }
    if ('date' in body) { try { patch.date = calendarDate(body.date, 'Meeting date', true); } catch (error) { return json({ error: error.message }, 400); } }
    if ('notes' in body) patch.notes = safeText(body.notes, 5000);
    if ('ai' in body) patch.ai = body.ai ? 1 : 0;
    if ('attendees' in body) patch.attendees = JSON.stringify(Array.isArray(body.attendees) ? body.attendees.map(x => safeText(x, 120)).filter(Boolean).slice(0, 30) : []);
    const keys = Object.keys(patch); if (!keys.length) return json({ error: 'No changes supplied.' }, 400);
    const result = await env.DB.prepare(`UPDATE meetings SET ${keys.map(key => `${key} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map(key => patch[key]), meetingMatch[1]).run();
    if (!result.meta.changes) return json({ error: 'Meeting not found.' }, 404);
    const saved = await env.DB.prepare('SELECT id, title, date, ai, notes, project_id AS projectId, (SELECT COUNT(*) FROM reviews WHERE meeting_id = m.id AND archived = 0) AS itemCount, attendees FROM meetings m WHERE id = ?').bind(meetingMatch[1]).first();
    await notifyUsers(env, user.id, { projectId: saved.projectId, type: 'meeting_updated', title: 'Meeting updated', body: user.name + ' updated "' + (saved?.title || 'a meeting') + '"' });
    return json({ ...saved, ai: Boolean(saved.ai), attendees: parseJson(saved.attendees, []) });
  }
  if (request.method === 'DELETE' && meetingMatch) {
    const meetingProject = await env.DB.prepare('SELECT project_id AS projectId FROM meetings WHERE id = ?').bind(meetingMatch[1]).first();
    if (!meetingProject) return json({ error: 'Meeting not found.' }, 404);
    if (!await requireProject(env, user, meetingProject.projectId, 'edit')) return accessDenied();
    const capture = await env.DB.prepare("SELECT 1 FROM meeting_captures WHERE meeting_id=? AND status NOT IN ('completed','failed')").bind(meetingMatch[1]).first();
    if (capture) return json({error:'Stop the meeting bot and sync its completed status before deleting this meeting.'},409);
    const doomed = await env.DB.prepare('SELECT title FROM meetings WHERE id = ?').bind(meetingMatch[1]).first();
    const result = await env.DB.batch([
      env.DB.prepare('UPDATE reviews SET meeting_id = NULL WHERE meeting_id = ?').bind(meetingMatch[1]),
      env.DB.prepare('DELETE FROM meetings WHERE id = ?').bind(meetingMatch[1])
    ]);
    if (result[1].meta.changes && doomed) await notifyUsers(env, user.id, { projectId: meetingProject.projectId, type: 'meeting_deleted', title: 'Meeting deleted', body: `"${doomed.title}" was removed` });
    return result[1].meta.changes ? json({ ok: true }) : json({ error: 'Meeting not found.' }, 404);
  }

  return json({ error: 'Not found.' }, 404);
}

export default {
  async scheduled(controller,env,ctx) {
    ctx.waitUntil(maintenance(env).catch(() => recordOperationalEvent(env,'maintenance','job_failure')));
    ctx.waitUntil(syncNotetakers(env).catch(() => recordOperationalEvent(env,'notetaker','poll_failure')));
  },
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      try { return secureResponse(await routeApi(request, env)); }
      catch (error) {
        if (error.message?.includes('Stop the meeting bot before deleting this meeting')) return secureResponse(json({error:'Stop the meeting bot and sync its final status before deleting this meeting or project.'},409));
        const errorId = crypto.randomUUID();
        ctx.waitUntil(recordOperationalEvent(env,'api','unhandled_500'));
        return secureResponse(json({ error: 'This action could not be completed. Please retry.', errorId }, 500));
      }
    }
    const pathname = new URL(request.url).pathname;
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    if (pathname.startsWith('/assets/') && (headers.get('content-type') || '').includes('text/html')) {
      // SPA fallback must never masquerade as an absent JavaScript/CSS chunk.
      return secureResponse(new Response(request.method === 'HEAD' ? null : 'Asset not found. Reload the application to load its current version.', {
        status:404, headers:{ 'content-type':'text/plain; charset=utf-8', 'cache-control':'no-store' }
      }));
    }
    // HTML is the manifest that points at Vite's hashed bundles. Never cache
    // it at the browser/edge so a deploy cannot leave users on an old bundle.
    if ((response.headers.get('content-type') || '').includes('text/html')) {
      headers.set('cache-control', 'no-store, no-cache, must-revalidate');
      headers.set('pragma', 'no-cache');
    } else if (pathname==='/asset-manifest.json' || pathname==='/release.json') {
      headers.set('cache-control','no-store');
    } else if (response.ok && /\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:css|js)$/.test(pathname)) {
      // Hashed Vite assets are immutable and safe to cache aggressively.
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    } else {
      headers.set('cache-control', 'public, max-age=3600, must-revalidate');
    }
    Object.entries(securityHeaders).forEach(([name, value]) => headers.set(name, value));
    const isHtml=(headers.get('content-type') || '').includes('text/html');
    const nonce=isHtml?crypto.randomUUID().replaceAll('-',''):'';
    headers.set('content-security-policy', `default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com ${nonce?`'nonce-${nonce}'`:''}; style-src-attr 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
    const result=new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    return isHtml && request.method!=='HEAD'?new HTMLRewriter().on('meta[name="synqra-style-nonce"]',{element(element){element.setAttribute('content',nonce);}}).transform(result):result;
  }
};
