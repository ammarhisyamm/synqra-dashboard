export const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export const safeText = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const id = () => crypto.randomUUID();
export const encoder = new TextEncoder();
export const sessionCookie = 'synqra_session';

export const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes));
export const base64ToBytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
export const cookieValue = (request, name) => (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
export const publicUser = user => ({ id: user.id, email: user.email, username: user.username || user.name, name: user.name, role: user.role });
export const parseJson = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };

export async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

// Lightweight in-memory sliding-window limiter for auth endpoints.
// NOTE: per-isolate only (Workers run many isolates). For strict global
// limits, use KV or the Cloudflare Rate Limiting API instead.
const authAttempts = new Map();
export function authRateLimited(request, limit = 10, windowMs = 60_000) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = `${ip}:${new URL(request.url).pathname}`;
  const now = Date.now();
  const recent = (authAttempts.get(key) || []).filter(t => now - t < windowMs);
  if (recent.length >= limit) return true;
  recent.push(now);
  authAttempts.set(key, recent);
  if (authAttempts.size > 5000) authAttempts.clear();
  return false;
}
export const tooManyRequests = () => Response.json({ error: 'Too many attempts. Please wait a minute and try again.' }, { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });

// Keep this aligned with the seeded workspace credentials and the auth form.
export const MIN_PASSWORD_LENGTH = 6;
