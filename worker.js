import { stages, areas, priorities, statuses, MAX_ATTACHMENT_BYTES } from './worker/constants.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const safeText = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const id = () => crypto.randomUUID();
const encoder = new TextEncoder();
const sessionCookie = 'synqra_session';

const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes));
const base64ToBytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const cookieValue = (request, name) => (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
const publicUser = user => ({ id: user.id, email: user.email, username: user.username || user.name, name: user.name, role: user.role });
const parseJson = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
async function sendInviteEmail(env, request, { to, inviterName }) {
  // Returns { sent: true } or { sent: false, reason } — never throws.
  // Requires RESEND_API_KEY secret; optional EMAIL_FROM secret (defaults to Resend onboarding sender).
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'email-not-configured' };
  try {
    const origin = new URL(request.url).origin;
    const from = env.EMAIL_FROM || 'Synqra <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${inviterName} invited you to collaborate on Synqra`,
        text: `${inviterName} invited you to collaborate on Synqra as a Viewer.\n\nOpen the workspace: ${origin}\n\nViewers can see reviews, meetings, and boards. Contact ${inviterName} for an account.`,
        html: `<div style="font-family:sans-serif;max-width:480px"><h2>You've been invited to Synqra</h2><p><strong>${inviterName}</strong> invited you to collaborate as a <strong>Viewer</strong>.</p><p><a href="${origin}">Open the workspace</a></p><p style="color:#888;font-size:12px">Viewers can see reviews, meetings, and boards. Contact ${inviterName} for an account.</p></div>`
      })
    });
    if (!response.ok) return { sent: false, reason: `email-provider-${response.status}` };
    return { sent: true };
  } catch {
    return { sent: false, reason: 'email-failed' };
  }
}
let workspaceSchema;
async function ensureWorkspaceSchema(env) {
  workspaceSchema ||= env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS project_metadata (id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT 'default', type TEXT NOT NULL CHECK (type IN ('epic','feature','label')), name TEXT NOT NULL, parent_id TEXT, color TEXT NOT NULL DEFAULT '#111b30', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(project_id, type, name))"),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_project_metadata_project_type ON project_metadata(project_id, type)'),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS project_member_roles (member_id TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','editor')), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (member_id) REFERENCES project_members(id) ON DELETE CASCADE)")
  ]);
  return workspaceSchema;
}

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
  return env.DB.prepare('SELECT u.id, u.email, u.username, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP').bind(token).first();
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
  await ensureWorkspaceSchema(env);
  const [reviews, meetings, project, spaces, projects, workflowStatuses, sprints, metadata, unread, workload, report] = await env.DB.batch([
    env.DB.prepare("SELECT id, key, title, area, priority, stage, assignee, due, start_date AS startDate, description, status, submitted_by AS submittedBy, reporter, meeting_id AS meetingId, estimate_hours AS estimateHours, epic, feature, sprint, labels, project_id AS projectId, parent_id AS parentId, item_type AS itemType, sprint_id AS sprintId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews ORDER BY created_at DESC"),
    env.DB.prepare("SELECT id, title, date, ai, notes, project_id AS projectId, (SELECT COUNT(*) FROM reviews WHERE meeting_id = m.id AND archived = 0) AS itemCount, attendees FROM meetings m ORDER BY date DESC"),
    env.DB.prepare("SELECT name, description, access_mode AS accessMode FROM project_settings WHERE id = 'default'"),
    env.DB.prepare('SELECT id, name, key, description FROM spaces ORDER BY name'),
    env.DB.prepare('SELECT id, space_id AS spaceId, name, description, access_mode AS accessMode FROM projects ORDER BY name'),
    env.DB.prepare('SELECT id, project_id AS projectId, name, color, position, is_terminal AS isTerminal FROM workflow_statuses ORDER BY project_id, position'),
    env.DB.prepare('SELECT id, project_id AS projectId, name, goal, start_date AS startDate, end_date AS endDate, status FROM sprints ORDER BY start_date DESC'),
    env.DB.prepare('SELECT id, project_id AS projectId, type, name, parent_id AS parentId, color FROM project_metadata ORDER BY type, name'),
    env.DB.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(userId),
    env.DB.prepare("SELECT COALESCE(NULLIF(assignee,''),'Unassigned') AS assignee, COUNT(*) AS count FROM reviews WHERE archived = 0 GROUP BY COALESCE(NULLIF(assignee,''),'Unassigned') ORDER BY count DESC"),
    env.DB.prepare("SELECT stage, COUNT(*) AS count FROM reviews WHERE archived = 0 GROUP BY stage ORDER BY count DESC")
  ]);
  const settings = project.results[0] || { name: 'Acme Redesign', description: '', accessMode: 'link' };
  return { project: { id: 'default', ...settings, initials: settings.name.slice(0, 1).toUpperCase() }, reviews: reviews.results.map(r => ({ ...r, labels: parseJson(r.labels, []) })), meetings: meetings.results.map(m => ({ ...m, ai: Boolean(m.ai), attendees: parseJson(m.attendees, []) })), spaces: spaces.results, projects: projects.results, workflowStatuses: workflowStatuses.results.map(s => ({ ...s, isTerminal: Boolean(s.isTerminal) })), sprints: sprints.results, metadata: metadata.results, unreadNotifications: Number(unread.results[0]?.count || 0), workload: workload.results, reportByStatus: report.results };
}
async function reviewSnapshot(env, reviewId) {
  return env.DB.prepare("SELECT id, key, title, area, priority, stage, assignee, due, start_date AS startDate, description, status, submitted_by AS submittedBy, reporter, meeting_id AS meetingId, estimate_hours AS estimateHours, epic, feature, sprint, labels, project_id AS projectId, parent_id AS parentId, item_type AS itemType, sprint_id AS sprintId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews WHERE id = ?").bind(reviewId).first();
}

async function notifyUsers(env, excludeUserId, { type, title, body, reviewId = null }) {
  const recipients = await env.DB.prepare('SELECT id FROM users WHERE id != ?').bind(excludeUserId).all();
  if (!recipients.results.length) return;
  await env.DB.batch(recipients.results.map(recipient => env.DB.prepare('INSERT INTO notifications (id, user_id, review_id, type, title, body) VALUES (?, ?, ?, ?, ?, ?)').bind(id(), recipient.id, reviewId, type, title, body)));
}
async function recordActivity(env, reviewId, userId, action, metadata = {}) {
  const review = await env.DB.prepare('SELECT title, assignee FROM reviews WHERE id = ?').bind(reviewId).first();
  const recipients = await env.DB.prepare('SELECT id FROM users WHERE id != ?').bind(userId).all();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO review_activity (id, review_id, user_id, action, metadata) VALUES (?, ?, ?, ?, ?)').bind(id(), reviewId, userId, action, JSON.stringify(metadata)),
    ...recipients.results.map(recipient => env.DB.prepare('INSERT INTO notifications (id, user_id, review_id, type, title, body) VALUES (?, ?, ?, ?, ?, ?)').bind(id(), recipient.id, reviewId, action, review?.title || 'Task update', `${action} on ${review?.title || 'task'}`))
  ]);
}

async function routeApi(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === 'POST' && path === '/api/auth/register') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const email = safeText(body.email, 254).toLowerCase(); const name = safeText(body.name, 80) || email.split('@')[0]; const username = safeText(body.username, 40).toLowerCase() || email.split('@')[0].replace(/[^a-z0-9_-]/g, ''); const password = typeof body.password === 'string' ? body.password : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (!/^[a-z0-9_-]{3,40}$/.test(username)) return json({ error: 'Use a username with 3–40 letters, numbers, hyphens, or underscores.' }, 400);
    if (password.length < 6) return json({ error: 'Use at least 6 characters for your password.' }, 400);
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? OR username = ?').bind(email, username).first();
    if (existing) return json({ error: 'An account with that email already exists.' }, 409);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first('count');
    const user = { id: id(), email, name, role: Number(count) === 0 ? 'super_admin' : 'member' };
    user.username = username;
    await env.DB.prepare('INSERT INTO users (id, email, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)').bind(user.id, user.email, user.username, user.name, await passwordHash(password), user.role).run();
    return signedIn(user, await createSession(user, env), 201);
  }
  if (request.method === 'POST' && path === '/api/auth/login') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const identifier = safeText(body.identifier || body.email, 254).toLowerCase(); const password = typeof body.password === 'string' ? body.password : '';
    const user = await env.DB.prepare('SELECT id, email, username, name, role, password_hash FROM users WHERE email = ? OR username = ?').bind(identifier, identifier).first();
    if (!user || !(await passwordMatches(password, user.password_hash))) return json({ error: 'Username, email, or password is incorrect.' }, 401);
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
  if (request.method === 'GET' && path === '/api/admin/users') {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const result = await env.DB.prepare('SELECT id, email, username, name, role, created_at AS createdAt FROM users ORDER BY CASE role WHEN \'super_admin\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END, name').all();
    return json({ users: result.results });
  }
  if (request.method === 'GET' && path === '/api/project-members') {
    const result = await env.DB.prepare("SELECT m.id, m.email, COALESCE(r.role, m.role, 'viewer') AS role, m.status, m.created_at AS createdAt FROM project_members m LEFT JOIN project_member_roles r ON r.member_id = m.id ORDER BY m.created_at DESC").all();
    return json({ members: result.results });
  }
  if (request.method === 'GET' && path === '/api/team') {
    // Assignable people: workspace users + invited members (email invites without accounts yet).
    const [users, members] = await env.DB.batch([
      env.DB.prepare('SELECT id, name, email FROM users ORDER BY name'),
      env.DB.prepare('SELECT email FROM project_members ORDER BY created_at DESC')
    ]);
    const seen = new Set();
    const team = [];
    for (const u of users.results) {
      const name = (u.name || '').trim() || u.email.split('@')[0];
      if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); team.push({ name, email: u.email, source: 'user' }); }
    }
    for (const m of members.results) {
      const email = (m.email || '').trim().toLowerCase();
      if (!email) continue;
      if (!team.some(t => t.email.toLowerCase() === email)) team.push({ name: email.split('@')[0], email, source: 'invite' });
    }
    return json({ team });
  }
  if (request.method === 'POST' && path === '/api/project-members') {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const email = safeText(body.email, 254).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (await env.DB.prepare('SELECT id FROM project_members WHERE email = ?').bind(email).first()) return json({ error: 'That email has already been invited.' }, 409);
    const role = ['viewer', 'editor'].includes(body.role) ? body.role : 'viewer';
    const member = { id: id(), email, role, status: 'invited' };
    await env.DB.batch([env.DB.prepare('INSERT INTO project_members (id, email, role, status, invited_by) VALUES (?, ?, ?, ?, ?)').bind(member.id, member.email, 'viewer', member.status, user.id), env.DB.prepare('INSERT INTO project_member_roles (member_id, role) VALUES (?, ?)').bind(member.id, role)]);
    const emailResult = await sendInviteEmail(env, request, { to: email, inviterName: user.name });
    return json({ ...member, emailSent: emailResult.sent, emailReason: emailResult.sent ? undefined : emailResult.reason }, 201);
  }
  const memberMatch = path.match(/^\/api\/project-members\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && memberMatch) {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); const role = body?.role;
    if (!['viewer', 'editor'].includes(role)) return json({ error: 'Choose Viewer or Editor.' }, 400);
    const exists = await env.DB.prepare('SELECT id FROM project_members WHERE id = ?').bind(memberMatch[1]).first();
    if (!exists) return json({ error: 'Invite not found.' }, 404);
    await env.DB.prepare("INSERT INTO project_member_roles (member_id, role, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(member_id) DO UPDATE SET role = excluded.role, updated_at = CURRENT_TIMESTAMP").bind(memberMatch[1], role).run();
    return json({ ok: true, role });
  }
  if (request.method === 'DELETE' && memberMatch) {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const result = await env.DB.prepare('DELETE FROM project_members WHERE id = ?').bind(memberMatch[1]).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Invite not found.' }, 404);
  }
  if (request.method === 'GET' && path === '/api/metadata') {
    const result = await env.DB.prepare('SELECT id, project_id AS projectId, type, name, parent_id AS parentId, color FROM project_metadata ORDER BY type, name').all();
    return json({ metadata: result.results });
  }
  if (request.method === 'POST' && path === '/api/metadata') {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); if (!body || !['epic', 'feature', 'label'].includes(body.type)) return json({ error: 'Invalid metadata type.' }, 400);
    const item = { id: id(), projectId: safeText(body.projectId, 80) || 'default', type: body.type, name: safeText(body.name, 100), parentId: safeText(body.parentId, 80) || null, color: /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#111b30' };
    if (!item.name) return json({ error: 'Name is required.' }, 400);
    try { await env.DB.prepare('INSERT INTO project_metadata (id, project_id, type, name, parent_id, color) VALUES (?, ?, ?, ?, ?, ?)').bind(item.id, item.projectId, item.type, item.name, item.parentId, item.color).run(); return json(item, 201); } catch { return json({ error: 'That item already exists in this project.' }, 409); }
  }
  const metadataMatch = path.match(/^\/api\/metadata\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && metadataMatch) {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const fields = {}; if ('name' in body) fields.name = safeText(body.name, 100); if ('parentId' in body) fields.parent_id = safeText(body.parentId, 80) || null; if ('color' in body && /^#[0-9a-fA-F]{6}$/.test(body.color)) fields.color = body.color;
    if (!Object.keys(fields).length || ('name' in fields && !fields.name)) return json({ error: 'Valid changes are required.' }, 400);
    const result = await env.DB.prepare(`UPDATE project_metadata SET ${Object.keys(fields).map(key => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...Object.values(fields), metadataMatch[1]).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Metadata not found.' }, 404);
  }
  if (request.method === 'DELETE' && metadataMatch) {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const result = await env.DB.prepare('DELETE FROM project_metadata WHERE id = ?').bind(metadataMatch[1]).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Metadata not found.' }, 404);
  }
  if (request.method === 'POST' && path === '/api/admin/users') {
    if (user.role !== 'super_admin') return json({ error: 'Super admin access required.' }, 403);
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const email = safeText(body.email, 254).toLowerCase(); const name = safeText(body.name, 80); const password = typeof body.password === 'string' ? body.password : '';
    const username = safeText(body.username, 40).toLowerCase() || email.split('@')[0].replace(/[^a-z0-9_-]/g, '');
    if (!/^\S+@\S+\.\S+$/.test(email) || !name || !/^[a-z0-9_-]{3,40}$/.test(username) || password.length < 6) return json({ error: 'Name, valid email, username, and a password of at least 6 characters are required.' }, 400);
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
  if (request.method === 'DELETE' && projectMatch) {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    if (projectMatch[1] === 'default') return json({ error: 'The default project is protected.' }, 400);
    const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectMatch[1]).first();
    if (!project) return json({ error: 'Project not found.' }, 404);
    const attachments = await env.DB.prepare('SELECT object_key AS objectKey FROM review_attachments WHERE review_id IN (SELECT id FROM reviews WHERE project_id = ?)').bind(projectMatch[1]).all();
    if (env.ATTACHMENTS && attachments.results.length) await Promise.all(attachments.results.map(item => env.ATTACHMENTS.delete(item.objectKey)));
    await env.DB.batch([
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
    return json({ ok: true });
  }
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
  if (request.method === 'GET' && path === '/api/reports/burndown') {
    // Burndown for one sprint: remaining open tasks per day vs ideal line.
    // resolvedAt = earliest status_history move to Resolved, else updated_at when already resolved.
    const sprintId = new URL(request.url).searchParams.get('sprint_id') || '';
    if (!sprintId) return json({ error: 'sprint_id is required.' }, 400);
    const sprint = await env.DB.prepare('SELECT id, name, start_date AS startDate, end_date AS endDate, status FROM sprints WHERE id = ?').bind(sprintId).first();
    if (!sprint) return json({ error: 'Sprint not found.' }, 404);
    const tasks = await env.DB.prepare("SELECT id, created_at AS createdAt, updated_at AS updatedAt, stage, status, archived FROM reviews WHERE archived = 0 AND (sprint_id = ? OR sprint = ?)").bind(sprint.id, sprint.name).all();
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
    const projectId = safeText(body.projectId, 80) || 'default';
    if (!await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first()) return json({ error: 'Project not found.' }, 400);
    const item = { id: id(), projectId, name, goal: safeText(body.goal, 500), startDate: safeText(body.startDate, 10) || null, endDate: safeText(body.endDate, 10) || null, status: ['planned','active','completed'].includes(body.status) ? body.status : 'planned' };
    try { await env.DB.prepare('INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(item.id, item.projectId, item.name, item.goal, item.startDate, item.endDate, item.status).run(); return json(item, 201); } catch { return json({ error: 'Sprint already exists.' }, 409); }
  }
  const sprintMatch = path.match(/^\/api\/workflow\/sprints\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'PATCH' && sprintMatch) {
    if (!['super_admin', 'admin'].includes(user.role)) return json({ error: 'Admin access required.' }, 403);
    const body = await readBody(request) || {};
    const fields = {};
    if ('name' in body) fields.name = safeText(body.name, 100);
    if ('goal' in body) fields.goal = safeText(body.goal, 500);
    if ('startDate' in body) fields.start_date = safeText(body.startDate, 10) || null;
    if ('endDate' in body) fields.end_date = safeText(body.endDate, 10) || null;
    if ('status' in body && ['planned', 'active', 'completed'].includes(body.status)) fields.status = body.status;
    if (!Object.keys(fields).length) return json({ error: 'No changes supplied.' }, 400);
    const result = await env.DB.prepare(`UPDATE sprints SET ${Object.keys(fields).map(key => `${key} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(fields), sprintMatch[1]).run();
    if (!result.meta.changes) return json({ error: 'Sprint not found.' }, 404);
    const saved = await env.DB.prepare('SELECT id, project_id AS projectId, name, goal, start_date AS startDate, end_date AS endDate, status FROM sprints WHERE id = ?').bind(sprintMatch[1]).first();
    return json(saved);
  }

  if (request.method === 'POST' && path === '/api/reviews') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    try {
      const review = normalizeReview(body);
      const maxKey = await env.DB.prepare("SELECT MAX(CAST(SUBSTR(key, INSTR(key, '-') + 1) AS INTEGER)) AS maxKey FROM reviews WHERE key LIKE 'AR-%'").first('maxKey');
      const newReview = { id: body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id(), key: `AR-${(maxKey || 0) + 1}`, ...review, submitted_by: review.submitted_by || user.name, archived: 0 };
      if (!await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(newReview.project_id || 'default').first()) return json({ error: 'Project not found.' }, 400);
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
      if ('project_id' in patch && !await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(patch.project_id).first()) return json({ error: 'Project not found.' }, 400);
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
    const meeting = { id: body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id(), title, date, projectId: safeText(body.projectId, 80) || 'default', notes: safeText(body.notes, 5000), ai: body.ai ? 1 : 0, itemCount: 0, attendees: Array.isArray(body.attendees) ? body.attendees.map(x => safeText(x, 120)).filter(Boolean).slice(0, 30) : [] };
    if (!await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(meeting.projectId).first()) return json({ error: 'Project not found.' }, 400);
    await env.DB.prepare('INSERT INTO meetings (id, project_id, title, date, ai, notes, item_count, attendees) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(meeting.id, meeting.projectId, meeting.title, meeting.date, meeting.ai, meeting.notes, meeting.itemCount, JSON.stringify(meeting.attendees)).run();
    await notifyUsers(env, user.id, { type: 'meeting_created', title: 'New meeting scheduled', body: `"${meeting.title}" on ${meeting.date}` });
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
    const saved = await env.DB.prepare('SELECT id, title, date, ai, notes, project_id AS projectId, (SELECT COUNT(*) FROM reviews WHERE meeting_id = m.id AND archived = 0) AS itemCount, attendees FROM meetings m WHERE id = ?').bind(meetingMatch[1]).first();
    return json({ ...saved, ai: Boolean(saved.ai), attendees: parseJson(saved.attendees, []) });
  }
  if (request.method === 'DELETE' && meetingMatch) {
    const doomed = await env.DB.prepare('SELECT title FROM meetings WHERE id = ?').bind(meetingMatch[1]).first();
    const result = await env.DB.batch([
      env.DB.prepare('UPDATE reviews SET meeting_id = NULL WHERE meeting_id = ?').bind(meetingMatch[1]),
      env.DB.prepare('DELETE FROM meetings WHERE id = ?').bind(meetingMatch[1])
    ]);
    if (result[1].meta.changes && doomed) await notifyUsers(env, user.id, { type: 'meeting_deleted', title: 'Meeting deleted', body: `"${doomed.title}" was removed` });
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
