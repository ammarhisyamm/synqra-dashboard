import { TOTP, Secret } from 'otpauth';
import { encoder, bytesToBase64, base64ToBytes, json, readBody, cookieValue, sessionCookie } from './utils.js';
import { passwordMatches, passwordHash } from './auth.js';

export const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
export function constantEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function encryptionKey(env) {
  const bytes = base64ToBytes(env.MFA_ENCRYPTION_KEY || '');
  if (bytes.length !== 32) throw new Error('MFA encryption is not configured.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptSecret(secret, env, userId) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name:'AES-GCM', iv:nonce, additionalData:encoder.encode(userId) }, await encryptionKey(env), encoder.encode(secret));
  return `${bytesToBase64(nonce)}.${bytesToBase64(new Uint8Array(data))}`;
}
export async function decryptSecret(value, env, userId) {
  const [nonce, data] = value.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name:'AES-GCM', iv:base64ToBytes(nonce), additionalData:encoder.encode(userId) }, await encryptionKey(env), base64ToBytes(data)));
}
export async function verifyMfa(env, userId, code, enrollment = false) {
  const row = await env.DB.prepare('SELECT * FROM user_mfa WHERE user_id=?').bind(userId).first();
  if (!row?.enabled && !enrollment) return true;
  if (!row || typeof code !== 'string') return false;
  const token = code.trim();
  if (!enrollment && /^[a-f0-9]{16}$/.test(token)) {
    const result = await env.DB.prepare('DELETE FROM mfa_recovery WHERE user_id=? AND code_hash=?').bind(userId, await digest(token)).run();
    return result.meta.changes === 1;
  }
  if (!/^\d{6}$/.test(token)) return false;
  const totp = new TOTP({ secret:await decryptSecret(row.secret, env, userId) });
  const timestamp = Date.now();
  const delta = totp.validate({ token, window:1, timestamp });
  if (delta == null) return false;
  const counter = Math.floor(timestamp / 30000) + delta;
  const result = await env.DB.prepare('UPDATE user_mfa SET last_counter=? WHERE user_id=? AND last_counter<? AND secret=?').bind(counter,userId,counter,row.secret).run();
  return result.meta.changes === 1;
}
export async function handleSecurity(request, env, user) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/account/')) return null;
  if (request.method==='POST' && env.AUTH_RATE_LIMITER && !(await env.AUTH_RATE_LIMITER.limit({ key:'account:'+user.id })).success) return json({ error:'Too many attempts. Try again in a minute.' },429);
  const token = cookieValue(request, sessionCookie) || '';
  if (path === '/api/account/security' && request.method === 'GET') {
    const [mfa, count] = await env.DB.batch([
      env.DB.prepare('SELECT enabled FROM user_mfa WHERE user_id=?').bind(user.id),
      env.DB.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id=? AND expires_at>CURRENT_TIMESTAMP').bind(user.id)
    ]);
    return json({ mfaEnabled:!!mfa.results[0]?.enabled, mfaAvailable:!!env.MFA_ENCRYPTION_KEY, activeSessions:count.results[0].count });
  }
  if (path === '/api/account/sessions/revoke' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(user.id,token).run();
    return json({ ok:true });
  }
  if (path === '/api/account/preferences') {
    if (request.method === 'GET') return json({ preferences:await env.DB.prepare('SELECT activity,reminders,mentions FROM user_preferences WHERE user_id=?').bind(user.id).first() || { activity:1,reminders:1,mentions:1 } });
    if (request.method === 'PATCH') {
      const body = await readBody(request);
      if (!body || ['activity','reminders','mentions'].some(key => typeof body[key] !== 'boolean')) return json({ error:'Choose each notification preference.' },400);
      await env.DB.prepare('INSERT INTO user_preferences(user_id,activity,reminders,mentions) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET activity=excluded.activity,reminders=excluded.reminders,mentions=excluded.mentions').bind(user.id,Number(body.activity),Number(body.reminders),Number(body.mentions)).run();
      return json({ ok:true });
    }
  }
  const body = await readBody(request);
  const account = await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
  if (request.method !== 'POST' || !body || !await passwordMatches(body.password || '',account.password_hash)) return json({ error:'Confirm your current password.' },403);
  if (path === '/api/account/password') {
    if (typeof body.newPassword !== 'string' || body.newPassword.length < 12 || body.newPassword.length > 128) return json({ error:'Use a new password of 12–128 characters.' },400);
    if (!await verifyMfa(env,user.id,body.code)) return json({ error:'Enter a valid authenticator or recovery code.' },403);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await passwordHash(body.newPassword),user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(user.id,token)
    ]);
    return json({ ok:true });
  }
  if (!env.MFA_ENCRYPTION_KEY) return json({ error:'MFA encryption must be configured by your administrator.' },503);
  if (path === '/api/account/mfa/setup') {
    const existing = await env.DB.prepare('SELECT enabled FROM user_mfa WHERE user_id=?').bind(user.id).first();
    if (existing?.enabled) return json({ error:'MFA is already enabled.' },409);
    const secret = new Secret({ size:20 }).base32;
    const result=await env.DB.prepare('INSERT INTO user_mfa(user_id,secret) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,last_counter=-1,created_at=CURRENT_TIMESTAMP WHERE user_mfa.enabled=0').bind(user.id,await encryptSecret(secret,env,user.id)).run();
    if(!result.meta.changes)return json({ error:'MFA is already enabled.' },409);
    return json({ secret, uri:new TOTP({ issuer:'Synqra',label:user.email,secret }).toString() });
  }
  if (path === '/api/account/mfa/enable') {
    const row = await env.DB.prepare('SELECT enabled,created_at FROM user_mfa WHERE user_id=?').bind(user.id).first();
    if (!row || row.enabled || Date.now() - Date.parse(row.created_at.replace(' ','T')+'Z') > 600000 || !await verifyMfa(env,user.id,body.code,true)) return json({ error:'Setup expired or code invalid. Start setup again.' },400);
    const codes = Array.from({ length:8 }, () => Array.from(crypto.getRandomValues(new Uint8Array(8)),b => b.toString(16).padStart(2,'0')).join(''));
    const hashes = await Promise.all(codes.map(digest));
    await env.DB.batch([
      env.DB.prepare('UPDATE user_mfa SET enabled=1 WHERE user_id=?').bind(user.id),
      env.DB.prepare('DELETE FROM mfa_recovery WHERE user_id=?').bind(user.id),
      ...hashes.map(hash => env.DB.prepare('INSERT INTO mfa_recovery(user_id,code_hash) VALUES(?,?)').bind(user.id,hash)),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(user.id,token)
    ]);
    return json({ ok:true,recoveryCodes:codes });
  }
  if (path === '/api/account/mfa/disable') {
    if (!await verifyMfa(env,user.id,body.code)) return json({ error:'Enter a valid authenticator or recovery code.' },403);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM user_mfa WHERE user_id=?').bind(user.id),
      env.DB.prepare('DELETE FROM mfa_recovery WHERE user_id=?').bind(user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(user.id,token)
    ]);
    return json({ ok:true });
  }
  return json({ error:'Not found.' },404);
}

export async function handlePasswordReset(request,env,user=null) {
  const path=new URL(request.url).pathname;
  if(path==='/api/admin/password-reset' && request.method==='POST'){
    if(user?.role!=='super_admin')return json({ error:'Super admin access required.' },403);
    const body=await readBody(request);
    const target=await env.DB.prepare('SELECT id,role FROM users WHERE id=?').bind(typeof body?.userId==='string'?body.userId:'').first();
    if(!target)return json({ error:'Account not found.' },404);
    if(target.role==='super_admin')return json({ error:'Super admins must use their own account recovery procedure.' },403);
    const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(target.id),
      env.DB.prepare("INSERT INTO password_resets(token_hash,user_id,expires_at,created_by) VALUES(?,?,datetime('now','+15 minutes'),?)").bind(await digest(token),target.id,user.id)
    ]);
    const link=new URL('/',env.APP_ORIGIN || request.url);link.hash='reset='+token;
    return json({ resetUrl:link.href,expiresInMinutes:15 },201);
  }
  if(path!=='/api/auth/password-reset' || request.method!=='POST')return null;
  const body=await readBody(request);
  if(typeof body?.token!=='string' || !/^[a-f0-9]{64}$/.test(body.token) || typeof body.password!=='string' || body.password.length<12 || body.password.length>128)return json({ error:'A valid reset link and a 12–128 character password are required.' },400);
  const hash=await digest(body.token);
  const reset=await env.DB.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP').bind(hash).first();
  if(!reset)return json({ error:'Reset link expired or already used. Ask an administrator for a new link.' },400);
  if(!await verifyMfa(env,reset.user_id,body.code))return json({ error:'Enter a valid authenticator or recovery code. MFA cannot be bypassed by a password reset.' },403);
  const result=await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=? WHERE id=? AND EXISTS(SELECT 1 FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP)').bind(await passwordHash(body.password),reset.user_id,hash),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP)').bind(reset.user_id,hash),
    env.DB.prepare('UPDATE password_resets SET used_at=CURRENT_TIMESTAMP WHERE token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP').bind(hash)
  ]);
  return result[0].meta.changes===1 ? json({ ok:true }) : json({ error:'Reset link was already used.' },400);
}
