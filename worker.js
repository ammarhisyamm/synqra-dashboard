import { stages, areas, priorities, statuses, MAX_ATTACHMENT_BYTES } from './worker/constants.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const safeText = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const id = () => crypto.randomUUID();
const encoder = new TextEncoder();
const sessionCookie = 'synqra_session';

const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes));
const base64ToBytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const cookieValue = (request, name) => (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
const publicUser = user => ({ id: user.id, email: user.email, name: user.name, role: user.role });
const parseJson = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };

async function passwordHash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `${bytesToBase64(salt)}.${bytesToBase64(new Uint8Array(bits))}`;
}
async function passwordMatches(password, stored) {
  const [salt, hash] = stored.split('.');
  if (!salt || !hash) return false;
  return (await passwordHash(password, base64ToBytes(salt))) === stored;
}
async function sessionUser(request, env) {
  const token = cookieValue(request, sessionCookie);
  if (!token) return null;
  return env.DB.prepare('SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP').bind(token).first();
}
async function createSession(user, env) {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'),
    env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiry)
  ]);
  return token;
}
function signedIn(user, token, status = 200) {
  return Response.json({ user: publicUser(user) }, { status, headers: { 'cache-control': 'no-store', 'set-cookie': `${sessionCookie}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` } });
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

function normalizeReview(input, partial = false) {
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

async function bootstrap(env, userId) {
  const [reviews, meetings, project, spaces, projects, workflowStatuses, sprints, unread, workload, report] = await env.DB.batch([
    env.DB.prepare("SELECT id, key, title, area, priority, stage, assignee, due, start_date AS startDate, description, status, submitted_by AS submittedBy, reporter, meeting_id AS meetingId, estimate_hours AS estimateHours, epic, feature, sprint, labels, project_id AS projectId, parent_id AS parentId, item_type AS itemType, sprint_id AS sprintId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews ORDER BY created_at DESC"),
    env.DB.prepare("SELECT id, title, date, ai, notes, (SELECT COUNT(*) FROM reviews WHERE meeting_id = m.id AND archived = 0) AS itemCount, attendees FROM meetings m ORDER BY date DESC"),
    env.DB.prepare("SELECT name, description, access_mode AS accessMode FROM project_settings WHERE id = 'default'"),
    env.DB.prepare('SELECT id, name, key, description FROM spaces ORDER BY name'),
    env.DB.prepare('SELECT id, space_id AS spaceId, name, description, access_mode AS accessMode FROM projects ORDER BY name'),
    env.DB.prepare('SELECT id, project_id AS projectId, name, color, position, is_terminal AS isTerminal FROM workflow_statuses ORDER BY project_id, position'),
    env.DB.prepare('SELECT id, project_id AS projectId, name, goal, start_date AS startDate, end_date AS endDate, status FROM sprints ORDER BY start_date DESC'),
    env.DB.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(userId),
    env.DB.prepare("SELECT COALESCE(NULLIF(assignee,''),'Unassigned') AS assignee, COUNT(*) AS count FROM reviews WHERE archived = 0 GROUP BY COALESCE(NULLIF(assignee,''),'Unassigned') ORDER BY count DESC"),
    env.DB.prepare("SELECT stage, COUNT(*) AS count FROM reviews WHERE archived = 0 GROUP BY stage ORDER BY count DESC")
  ]);
  const settings = project.results[0] || { name: 'Acme Redesign', description: '', accessMode: 'link' };
  return { project: { id: 'default', ...settings, initials: settings.name.slice(0, 1).toUpperCase() }, reviews: reviews.results.map(r => ({ ...r, labels: parseJson(r.labels, []) })), meetings: meetings.results.map(m => ({ ...m, ai: Boolean(m.ai), attendees: parseJson(m.attendees, []) })), spaces: spaces.results, projects: projects.results, workflowStatuses: workflowStatuses.results.map(s => ({ ...s, isTerminal: Boolean(s.isTerminal) })), sprints: sprints.results, unreadNotifications: Number(unread.results[0]?.count || 0), workload: workload.results, reportByStatus: report.results };
}
async function reviewSnapshot(env, reviewId) {
  return env.DB.prepare("SELECT id, key, title, area, priority, stage, assignee, due, start_date AS startDate, description, status, submitted_by AS submittedBy, reporter, meeting_id AS meetingId, estimate_hours AS estimateHours, epic, feature, sprint, labels, project_id AS projectId, parent_id AS parentId, item_type AS itemType, sprint_id AS sprintId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews WHERE id = ?").bind(reviewId).first();
}

async function recordActivity(env, reviewId, userId, action, metadata = {}) {
  const review = await env.DB.prepare('SELECT title, assignee FROM reviews WHERE id = ?').bind(reviewId).first();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO review_activity (id, review_id, user_id, action, metadata) VALUES (?, ?, ?, ?, ?)').bind(id(), reviewId, userId, action, JSON.stringify(metadata)),
    env.DB.prepare('INSERT INTO notifications (id, user_id, review_id, type, title, body) VALUES (?, ?, ?, ?, ?, ?)').bind(id(), userId, reviewId, action, review?.title || 'Task update', `${action} on ${review?.title || 'task'}`)
  ]);
}

async function routeApi(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === 'POST' && path === '/api/auth/register') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const email = safeText(body.email, 254).toLowerCase(); const name = safeText(body.name, 80) || email.split('@')[0]; const password = typeof body.password === 'string' ? body.password : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (password.length < 10) return json({ error: 'Use at least 10 characters for your password.' }, 400);
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return json({ error: 'An account with that email already exists.' }, 409);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first('count');
    const user = { id: id(), email, name, role: Number(count) === 0 ? 'super_admin' : 'member' };
    await env.DB.prepare('INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)').bind(user.id, user.email, user.name, await passwordHash(password), user.role).run();
    return signedIn(user, await createSession(user, env), 201);
  }
  if (request.method === 'POST' && path === '/api/auth/login') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const email = safeText(body.email, 254).toLowerCase(); const password = typeof body.password === 'string' ? body.password : '';
    const user = await env.DB.prepare('SELECT id, email, name, role, password_hash FROM users WHERE email = ?').bind(email).first();
    if (!user || !(await passwordMatches(password, user.password_hash))) return json({ error: 'Email or password is incorrect.' }, 401);
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
  if (request.method === 'GET' && path === '/api/admin/users') {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const result = await env.DB.prepare('SELECT id, email, name, role, created_at AS createdAt FROM users ORDER BY CASE role WHEN \'super_admin\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END, name').all();
    return json({ users: result.results });
  }
  if (request.method === 'POST' && path === '/api/admin/users') {
    if (user.role !== 'super_admin') return json({ error: 'Super admin access required.' }, 403);
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const email = safeText(body.email, 254).toLowerCase(); const name = safeText(body.name, 80); const password = typeof body.password === 'string' ? body.password : '';
    if (!/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 10) return json({ error: 'Name, valid email, and a password of at least 10 characters are required.' }, 400);
    if (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) return json({ error: 'An account with that email already exists.' }, 409);
    const admin = { id: id(), email, name, role: 'admin' };
    await env.DB.prepare('INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)').bind(admin.id, email, name, await passwordHash(password), admin.role).run();
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
  if (request.method === 'GET' && path === '/api/bootstrap') return json(await bootstrap(env, user.id));

  if (request.method === 'GET' && path === '/api/project-settings') {
    const settings = await env.DB.prepare("SELECT name, description, access_mode AS accessMode FROM project_settings WHERE id = 'default'").first();
    return json(settings || { name: 'Acme Redesign', description: '', accessMode: 'link' });
  }
  if (request.method === 'GET' && path === '/api/spaces') {
    const result = await env.DB.prepare('SELECT s.id, s.name, s.key, s.description, COUNT(p.id) AS projectCount FROM spaces s LEFT JOIN projects p ON p.space_id = s.id GROUP BY s.id ORDER BY s.name').all();
    return json({ spaces: result.results });
  }
  if (request.method === 'POST' && path === '/api/projects') {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); const name = safeText(body?.name, 120); if (!name) return json({ error: 'Project name is required.' }, 400);
    const project = { id: id(), name, description: safeText(body.description, 2000), spaceId: safeText(body.spaceId, 80) || 'default', accessMode: 'link' };
    try { await env.DB.prepare('INSERT INTO projects (id, space_id, name, description, access_mode) VALUES (?, ?, ?, ?, ?)').bind(project.id, project.spaceId, project.name, project.description, project.accessMode).run(); return json(project, 201); } catch { return json({ error: 'Space or project already exists.' }, 409); }
  }
  const projectMatch = path.match(/^\/api\/projects\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && projectMatch) {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); const fields = {}; if ('name' in (body || {})) fields.name = safeText(body.name, 120); if ('description' in (body || {})) fields.description = safeText(body.description, 2000); if (!Object.keys(fields).length) return json({ error: 'No changes supplied.' }, 400);
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
    return json({ name, description, accessMode, initials: name.slice(0, 1).toUpperCase() });
  }
  if (request.method === 'GET' && path === '/api/notifications') {
    const result = await env.DB.prepare("SELECT n.id, n.type, n.title, n.body, n.read_at AS readAt, n.created_at AS createdAt, n.review_id AS reviewId FROM notifications n WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50").bind(user.id).all();
    return json({ notifications: result.results.map(item => ({ ...item, read: Boolean(item.readAt) })) });
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

  if (request.method === 'GET' && path === '/api/workflow/statuses') {
    const result = await env.DB.prepare('SELECT id, project_id AS projectId, name, color, position, is_terminal AS isTerminal FROM workflow_statuses ORDER BY position').all();
    return json({ statuses: result.results.map(item => ({ ...item, isTerminal: Boolean(item.isTerminal) })) });
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
    return json({ sprints: result.results });
  }
  if (request.method === 'POST' && path === '/api/workflow/sprints') {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); const name = safeText(body?.name, 100); if (!name) return json({ error: 'Sprint name is required.' }, 400);
    const item = { id: id(), name, goal: safeText(body.goal, 500), startDate: safeText(body.startDate, 10) || null, endDate: safeText(body.endDate, 10) || null, status: ['planned','active','completed'].includes(body.status) ? body.status : 'planned' };
    try { await env.DB.prepare('INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(item.id, 'default', item.name, item.goal, item.startDate, item.endDate, item.status).run(); return json(item, 201); } catch { return json({ error: 'Sprint already exists.' }, 409); }
  }

  if (request.method === 'POST' && path === '/api/reviews') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    try {
      const review = normalizeReview(body);
      const maxKey = await env.DB.prepare("SELECT MAX(CAST(SUBSTR(key, INSTR(key, '-') + 1) AS INTEGER)) AS maxKey FROM reviews WHERE key LIKE 'AR-%'").first('maxKey');
      const newReview = { id: body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id(), key: `AR-${(maxKey || 0) + 1}`, ...review, submitted_by: review.submitted_by || user.name, archived: 0 };
      if (newReview.meeting_id && !await env.DB.prepare('SELECT id FROM meetings WHERE id = ?').bind(newReview.meeting_id).first()) return json({ error: 'Related meeting not found.' }, 400);
      if (newReview.parent_id && !await env.DB.prepare('SELECT id FROM reviews WHERE id = ?').bind(newReview.parent_id).first()) return json({ error: 'Parent item not found.' }, 400);
      await env.DB.prepare('INSERT INTO reviews (id, key, title, area, priority, stage, assignee, due, start_date, description, status, submitted_by, meeting_id, reporter, estimate_hours, epic, feature, sprint, labels, project_id, parent_id, item_type, sprint_id, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(newReview.id, newReview.key, newReview.title, newReview.area, newReview.priority, newReview.stage, newReview.assignee, newReview.due, newReview.start_date ?? null, newReview.description, newReview.status, newReview.submitted_by, newReview.meeting_id, newReview.reporter || user.name, newReview.estimate_hours ?? null, newReview.epic || '', newReview.feature || '', newReview.sprint || '', newReview.labels || '[]', newReview.project_id || 'default', newReview.parent_id || null, newReview.item_type || 'task', newReview.sprint_id || null, newReview.archived).run();
      await env.DB.prepare('INSERT INTO review_status_history (id, review_id, from_status, to_status, user_id) VALUES (?, ?, ?, ?, ?)').bind(id(), newReview.id, null, newReview.status, user.id).run();
      await recordActivity(env, newReview.id, user.id, 'created', { title: newReview.title });
      const saved = await reviewSnapshot(env, newReview.id);
      return json({ ...saved, labels: parseJson(saved.labels, []) }, 201);
    } catch (error) { return json({ error: error.message }, 400); }
  }

  const detailsMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/details$/);
  if (request.method === 'GET' && detailsMatch) {
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
    return json({ review: { ...review, labels: parseJson(review.labels, []) }, meeting: meeting.results[0] || null, comments: comments.results, subtasks: subtasks.results.map(item => ({ ...item, completed: Boolean(item.completed) })), history: history.results, children: children.results, attachments: attachments.results, activity: activity.results.map(item => ({ ...item, metadata: parseJson(item.metadata, {}) })) });
  }
  const commentMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/comments$/);
  if (request.method === 'POST' && commentMatch) {
    const body = await readBody(request); const text = safeText(body?.body, 2000);
    if (!text) return json({ error: 'Comment cannot be empty.' }, 400);
    const comment = { id: id(), body: text, createdAt: new Date().toISOString() };
    const exists = await env.DB.prepare('SELECT id FROM reviews WHERE id = ?').bind(commentMatch[1]).first();
    if (!exists) return json({ error: 'Review not found.' }, 404);
    await env.DB.prepare('INSERT INTO review_comments (id, review_id, user_id, body) VALUES (?, ?, ?, ?)').bind(comment.id, commentMatch[1], user.id, text).run();
    await recordActivity(env, commentMatch[1], user.id, 'commented', {});
    return json({ ...comment, name: user.name, email: user.email }, 201);
  }
  const reviewMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && reviewMatch) {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    try {
      const before = await reviewSnapshot(env, reviewMatch[1]);
      if (!before) return json({ error: 'Review not found.' }, 404);
      const patch = normalizeReview(body, true); const keys = Object.keys(patch);
      if (!keys.length) return json({ error: 'No changes supplied.' }, 400);
      if ('meeting_id' in patch && patch.meeting_id && !await env.DB.prepare('SELECT id FROM meetings WHERE id = ?').bind(patch.meeting_id).first()) return json({ error: 'Related meeting not found.' }, 400);
      const values = keys.map(key => patch[key]);
      const result = await env.DB.prepare(`UPDATE reviews SET ${keys.map(key => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, reviewMatch[1]).run();
      if (!result.meta.changes) return json({ error: 'Review not found.' }, 404);
      const saved = await reviewSnapshot(env, reviewMatch[1]);
      if ('status' in patch && patch.status !== before.status) await env.DB.prepare('INSERT INTO review_status_history (id, review_id, from_status, to_status, user_id) VALUES (?, ?, ?, ?, ?)').bind(id(), reviewMatch[1], before.status, patch.status, user.id).run();
      const changes = Object.fromEntries(keys.map(key => [key, { from: before[key], to: saved[key] }]));
      await recordActivity(env, reviewMatch[1], user.id, 'updated', { fields: keys, changes });
      return json({ ...saved, labels: parseJson(saved.labels, []) });
    } catch (error) { return json({ error: error.message }, 400); }
  }

  if (request.method === 'DELETE' && reviewMatch) {
    const result = await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(reviewMatch[1]).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Review not found.' }, 404);
  }

  const subtasksPostMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/subtasks$/);
  if (request.method === 'POST' && subtasksPostMatch) {
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
    const body = await readBody(request); const patch = {};
    if ('title' in (body || {})) patch.title = safeText(body.title, 240);
    if ('completed' in (body || {})) patch.completed = body.completed ? 1 : 0;
    if (!Object.keys(patch).length) return json({ error: 'No changes supplied.' }, 400);
    const keys = Object.keys(patch); const result = await env.DB.prepare(`UPDATE review_subtasks SET ${keys.map(key => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND review_id = ?`).bind(...keys.map(key => patch[key]), subtaskMatch[2], subtaskMatch[1]).run();
    return result.meta.changes ? json({ ...patch, id: subtaskMatch[2], completed: Boolean(patch.completed) }) : json({ error: 'Subtask not found.' }, 404);
  }
  if (subtaskMatch && request.method === 'DELETE') {
    const result = await env.DB.prepare('DELETE FROM review_subtasks WHERE id = ? AND review_id = ?').bind(subtaskMatch[2], subtaskMatch[1]).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Subtask not found.' }, 404);
  }

  const attachmentPostMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/attachments$/);
  if (request.method === 'POST' && attachmentPostMatch) {
    if (!env.ATTACHMENTS) return json({ error: 'R2 attachments are not configured.' }, 503);
    const form = await request.formData(); const file = form.get('file');
    if (!(file instanceof File) || !file.size) return json({ error: 'Choose a file to upload.' }, 400);
    if (file.size > MAX_ATTACHMENT_BYTES) return json({ error: 'Files must be 50 MB or smaller.' }, 413);
    if (!await env.DB.prepare('SELECT id FROM reviews WHERE id = ?').bind(attachmentPostMatch[1]).first()) return json({ error: 'Review not found.' }, 404);
    const filename = safeText(file.name, 180) || 'attachment'; const key = `${attachmentPostMatch[1]}/${id()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await env.ATTACHMENTS.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
    const item = { id: id(), filename, contentType: file.type || 'application/octet-stream', size: file.size };
    await env.DB.prepare('INSERT INTO review_attachments (id, review_id, user_id, object_key, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(item.id, attachmentPostMatch[1], user.id, key, item.filename, item.contentType, item.size).run();
    await recordActivity(env, attachmentPostMatch[1], user.id, 'attachment_added', { filename });
    return json(item, 201);
  }
  const attachmentMatch = path.match(/^\/api\/attachments\/([a-zA-Z0-9-]+)$/);
  if (attachmentMatch && request.method === 'GET') {
    if (!env.ATTACHMENTS) return json({ error: 'R2 attachments are not configured.' }, 503);
    const item = await env.DB.prepare('SELECT object_key AS objectKey, filename, content_type AS contentType FROM review_attachments WHERE id = ?').bind(attachmentMatch[1]).first();
    if (!item) return json({ error: 'Attachment not found.' }, 404); const object = await env.ATTACHMENTS.get(item.objectKey);
    if (!object) return json({ error: 'Attachment object not found.' }, 404);
    return new Response(object.body, { headers: { 'content-type': item.contentType, 'content-disposition': `attachment; filename="${item.filename.replace(/"/g, '')}"`, 'cache-control': 'private, max-age=3600' } });
  }
  if (attachmentMatch && request.method === 'DELETE') {
    if (!env.ATTACHMENTS) return json({ error: 'R2 attachments are not configured.' }, 503);
    const item = await env.DB.prepare('SELECT object_key AS objectKey, review_id AS reviewId FROM review_attachments WHERE id = ?').bind(attachmentMatch[1]).first();
    if (!item) return json({ error: 'Attachment not found.' }, 404); await env.ATTACHMENTS.delete(item.objectKey); await env.DB.prepare('DELETE FROM review_attachments WHERE id = ?').bind(attachmentMatch[1]).run(); await recordActivity(env, item.reviewId, user.id, 'attachment_removed', {}); return json({ ok: true });
  }

  if (request.method === 'POST' && path === '/api/meetings') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const title = safeText(body.title); const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null;
    if (!title || !date) return json({ error: 'Meeting title and date are required.' }, 400);
    const meeting = { id: body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id(), title, date, notes: safeText(body.notes, 5000), ai: body.ai ? 1 : 0, itemCount: 0, attendees: Array.isArray(body.attendees) ? body.attendees.map(x => safeText(x, 120)).filter(Boolean).slice(0, 30) : [] };
    await env.DB.prepare('INSERT INTO meetings (id, title, date, ai, notes, item_count, attendees) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(meeting.id, meeting.title, meeting.date, meeting.ai, meeting.notes, meeting.itemCount, JSON.stringify(meeting.attendees)).run();
    return json({ ...meeting, ai: Boolean(meeting.ai) }, 201);
  }

  const meetingMatch = path.match(/^\/api\/meetings\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && meetingMatch) {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const patch = {};
    if ('title' in body) { patch.title = safeText(body.title, 200); if (!patch.title) return json({ error: 'Meeting title is required.' }, 400); }
    if ('date' in body) { if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return json({ error: 'Invalid meeting date.' }, 400); patch.date = body.date; }
    if ('notes' in body) patch.notes = safeText(body.notes, 5000);
    if ('ai' in body) patch.ai = body.ai ? 1 : 0;
    if ('attendees' in body) patch.attendees = JSON.stringify(Array.isArray(body.attendees) ? body.attendees.map(x => safeText(x, 120)).filter(Boolean).slice(0, 30) : []);
    const keys = Object.keys(patch); if (!keys.length) return json({ error: 'No changes supplied.' }, 400);
    const result = await env.DB.prepare(`UPDATE meetings SET ${keys.map(key => `${key} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map(key => patch[key]), meetingMatch[1]).run();
    if (!result.meta.changes) return json({ error: 'Meeting not found.' }, 404);
    const saved = await env.DB.prepare('SELECT id, title, date, ai, notes, (SELECT COUNT(*) FROM reviews WHERE meeting_id = m.id AND archived = 0) AS itemCount, attendees FROM meetings m WHERE id = ?').bind(meetingMatch[1]).first();
    return json({ ...saved, ai: Boolean(saved.ai), attendees: parseJson(saved.attendees, []) });
  }
  if (request.method === 'DELETE' && meetingMatch) {
    const result = await env.DB.batch([
      env.DB.prepare('UPDATE reviews SET meeting_id = NULL WHERE meeting_id = ?').bind(meetingMatch[1]),
      env.DB.prepare('DELETE FROM meetings WHERE id = ?').bind(meetingMatch[1])
    ]);
    return result[1].meta.changes ? json({ ok: true }) : json({ error: 'Meeting not found.' }, 404);
  }

  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return routeApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
