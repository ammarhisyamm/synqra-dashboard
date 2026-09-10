const stages = new Set(['Planning', 'Review', 'In Progress', 'Final', 'Completed']);
const areas = new Set(['Design', 'Engineering', 'Marketing']);
const priorities = new Set(['Blocker', 'Major', 'Minor']);
const statuses = new Set(['Open', 'In Progress', 'Review', 'Resolved', 'Rejected']);

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const safeText = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const id = () => crypto.randomUUID();
const encoder = new TextEncoder();
const sessionCookie = 'synqra_session';

const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes));
const base64ToBytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const cookieValue = (request, name) => (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
const publicUser = user => ({ id: user.id, email: user.email, name: user.name, role: user.role });

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
  if (!partial || 'stage' in input) { if (!stages.has(input.stage)) throw new Error('Invalid stage.'); review.stage = input.stage; }
  if (!partial || 'assignee' in input) review.assignee = safeText(input.assignee, 80);
  if (!partial || 'due' in input) review.due = /^\d{4}-\d{2}-\d{2}$/.test(input.due || '') ? input.due : null;
  if (!partial || 'description' in input) review.description = safeText(input.description, 4000);
  if (!partial || 'status' in input) { if (!statuses.has(input.status || 'Open')) throw new Error('Invalid review status.'); review.status = input.status || 'Open'; }
  if (!partial || 'submittedBy' in input) review.submitted_by = safeText(input.submittedBy, 120);
  if (!partial || 'meetingId' in input) review.meeting_id = safeText(input.meetingId, 80) || null;
  if ('archived' in input) review.archived = input.archived ? 1 : 0;
  return review;
}

async function bootstrap(env) {
  const [reviews, meetings] = await env.DB.batch([
    env.DB.prepare('SELECT id, title, area, priority, stage, assignee, due, description, status, submitted_by AS submittedBy, meeting_id AS meetingId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews ORDER BY created_at DESC'),
    env.DB.prepare('SELECT id, title, date, ai, notes, item_count AS itemCount FROM meetings ORDER BY date DESC')
  ]);
  return { project: { name: 'Acme Redesign', initials: 'A' }, reviews: reviews.results, meetings: meetings.results.map(m => ({ ...m, ai: Boolean(m.ai) })) };
}

async function recordActivity(env, reviewId, userId, action, metadata = {}) {
  await env.DB.prepare('INSERT INTO review_activity (id, review_id, user_id, action, metadata) VALUES (?, ?, ?, ?, ?)').bind(id(), reviewId, userId, action, JSON.stringify(metadata)).run();
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
  if (request.method === 'GET' && path === '/api/bootstrap') return json(await bootstrap(env));

  if (request.method === 'POST' && path === '/api/reviews') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    try {
      const review = normalizeReview(body);
      const newReview = { id: body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id(), ...review, submitted_by: review.submitted_by || user.name, archived: 0 };
      await env.DB.prepare('INSERT INTO reviews (id, title, area, priority, stage, assignee, due, description, status, submitted_by, meeting_id, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(newReview.id, newReview.title, newReview.area, newReview.priority, newReview.stage, newReview.assignee, newReview.due, newReview.description, newReview.status, newReview.submitted_by, newReview.meeting_id, newReview.archived).run();
      await recordActivity(env, newReview.id, user.id, 'created', { title: newReview.title });
      return json(newReview, 201);
    } catch (error) { return json({ error: error.message }, 400); }
  }

  const detailsMatch = path.match(/^\/api\/reviews\/([a-zA-Z0-9-]+)\/details$/);
  if (request.method === 'GET' && detailsMatch) {
    const review = await env.DB.prepare('SELECT id, title, area, priority, stage, assignee, due, description, status, submitted_by AS submittedBy, meeting_id AS meetingId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews WHERE id = ?').bind(detailsMatch[1]).first();
    if (!review) return json({ error: 'Review not found.' }, 404);
    const [comments, activity, meeting] = await env.DB.batch([
      env.DB.prepare('SELECT c.id, c.body, c.created_at AS createdAt, u.name, u.email FROM review_comments c JOIN users u ON u.id = c.user_id WHERE c.review_id = ? ORDER BY c.created_at ASC').bind(detailsMatch[1]),
      env.DB.prepare('SELECT a.id, a.action, a.metadata, a.created_at AS createdAt, u.name, u.email FROM review_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.review_id = ? ORDER BY a.created_at DESC').bind(detailsMatch[1]),
      env.DB.prepare('SELECT id, title, date, notes, item_count AS itemCount FROM meetings WHERE id = (SELECT meeting_id FROM reviews WHERE id = ?)').bind(detailsMatch[1])
    ]);
    return json({ review, meeting: meeting.results[0] || null, comments: comments.results, activity: activity.results.map(item => ({ ...item, metadata: JSON.parse(item.metadata || '{}') })) });
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
      const patch = normalizeReview(body, true); const keys = Object.keys(patch);
      if (!keys.length) return json({ error: 'No changes supplied.' }, 400);
      const values = keys.map(key => patch[key]);
      const result = await env.DB.prepare(`UPDATE reviews SET ${keys.map(key => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, reviewMatch[1]).run();
      if (!result.meta.changes) return json({ error: 'Review not found.' }, 404);
      await recordActivity(env, reviewMatch[1], user.id, 'updated', { fields: keys });
      const saved = await env.DB.prepare('SELECT id, title, area, priority, stage, assignee, due, description, status, submitted_by AS submittedBy, meeting_id AS meetingId, created_at AS createdAt, updated_at AS updatedAt, archived FROM reviews WHERE id = ?').bind(reviewMatch[1]).first();
      return json(saved);
    } catch (error) { return json({ error: error.message }, 400); }
  }

  if (request.method === 'DELETE' && reviewMatch) {
    const result = await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(reviewMatch[1]).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Review not found.' }, 404);
  }

  if (request.method === 'POST' && path === '/api/meetings') {
    const body = await readBody(request); if (!body) return json({ error: 'Invalid JSON.' }, 400);
    const title = safeText(body.title); const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null;
    if (!title || !date) return json({ error: 'Meeting title and date are required.' }, 400);
    const meeting = { id: body.id && /^[a-zA-Z0-9-]{8,80}$/.test(body.id) ? body.id : id(), title, date, notes: safeText(body.notes, 5000), ai: body.ai ? 1 : 0, itemCount: 0 };
    await env.DB.prepare('INSERT INTO meetings (id, title, date, ai, notes, item_count) VALUES (?, ?, ?, ?, ?, ?)').bind(meeting.id, meeting.title, meeting.date, meeting.ai, meeting.notes, meeting.itemCount).run();
    return json({ ...meeting, ai: Boolean(meeting.ai) }, 201);
  }

  const meetingMatch = path.match(/^\/api\/meetings\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'DELETE' && meetingMatch) {
    const result = await env.DB.prepare('DELETE FROM meetings WHERE id = ?').bind(meetingMatch[1]).run();
    if (!result.meta.changes) return json({ error: 'Meeting not found.' }, 404);
    return json({ ok: true });
  }

  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return routeApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
