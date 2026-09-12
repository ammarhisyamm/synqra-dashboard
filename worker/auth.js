import { encoder, bytesToBase64, base64ToBytes, cookieValue, sessionCookie, publicUser } from './utils.js';

export async function passwordHash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `${bytesToBase64(salt)}.${bytesToBase64(new Uint8Array(bits))}`;
}
export async function passwordMatches(password, stored) {
  const [salt, hash] = stored.split('.');
  if (!salt || !hash) return false;
  return (await passwordHash(password, base64ToBytes(salt))) === stored;
}
export async function sessionUser(request, env) {
  const token = cookieValue(request, sessionCookie);
  if (!token) return null;
  return env.DB.prepare('SELECT u.id, u.email, u.username, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP').bind(token).first();
}
export async function createSession(user, env) {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  // SQLite-friendly UTC ('YYYY-MM-DD HH:MM:SS') so string comparison with
  // CURRENT_TIMESTAMP is correct (ISO 'T' separator would miscompare).
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'),
    env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiry)
  ]);
  return token;
}
export function signedIn(user, token, status = 200) {
  return Response.json({ user: publicUser(user) }, { status, headers: { 'cache-control': 'no-store', 'set-cookie': `${sessionCookie}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` } });
}

export async function canAccessProject(env, user, projectId = 'default', permission = 'view') {
  if (['super_admin', 'admin'].includes(user.role)) return true;
  const project = await env.DB.prepare('SELECT id, access_mode AS accessMode FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) return false;
  const membership = await env.DB.prepare('SELECT role FROM project_memberships WHERE project_id = ? AND user_id = ?').bind(projectId, user.id).first();
  if (membership) return permission === 'view' || membership.role === 'editor';
  return permission === 'view' && project.accessMode === 'link';
}

export async function projectIdForReview(env, reviewId) {
  const row = await env.DB.prepare('SELECT project_id AS projectId FROM reviews WHERE id = ?').bind(reviewId).first();
  return row?.projectId || null;
}
