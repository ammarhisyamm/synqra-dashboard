import { canAccessProject } from './auth.js';
import { json, readBody, safeText, id } from './utils.js';
import { sendInviteEmail } from './email.js';
import { notifyUsers } from './reviews.js';

const digest = async token => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).map(byte => byte.toString(16).padStart(2, '0')).join('');

export async function handleProjectPeople(request, env, user) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== '/api/team' && !path.startsWith('/api/project-members')) return null;
  if (path === '/api/project-members/accept' && request.method === 'POST') {
    const body = await readBody(request);
    const token = safeText(body?.token, 128);
    if (token.length < 32) return json({ error: 'Invalid invitation.' }, 400);
    const invitation = await env.DB.prepare("SELECT * FROM project_invitations WHERE token_hash = ? AND email = ? AND status = 'invited' AND created_at > datetime('now', '-7 days')").bind(await digest(token), user.email).first();
    if (!invitation) return json({ error: 'Invitation expired or belongs to another account.' }, 403);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO project_memberships(project_id,user_id,role) VALUES (?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role, updated_at=CURRENT_TIMESTAMP").bind(invitation.project_id, user.id, invitation.role),
      env.DB.prepare("UPDATE project_invitations SET status='accepted', token_hash=NULL WHERE id=?").bind(invitation.id)
    ]);
    return json({ ok: true, projectId: invitation.project_id });
  }
  const body = request.method === 'GET' || request.method === 'DELETE' ? null : await readBody(request);
  const projectId = safeText(body?.projectId || url.searchParams.get('project_id'), 80);
  if (!projectId) return path === '/api/team' ? json({ team: [{ id: user.id, name: user.name, email: user.email, source: 'user' }] }) : json({ error: 'Choose a project first.' }, 400);
  const project = await env.DB.prepare('SELECT id, name,created_by AS createdBy FROM projects WHERE id=?').bind(projectId).first();
  if (!project || !await canAccessProject(env, user, projectId, 'view')) return json({ error: 'Project access required.' }, 403);
  if (path === '/api/team' && request.method === 'GET') {
    const users = await env.DB.prepare('SELECT u.id,u.name,u.email,u.username FROM users u JOIN project_memberships p ON p.user_id=u.id WHERE p.project_id=? ORDER BY u.name').bind(projectId).all();
    const team = users.results.map(person => ({ ...person, source: 'user' }));
    if (!team.some(person => person.id === user.id)) team.push({ id: user.id, name: user.name, email: user.email, source: 'user' });
    return json({ team });
  }
  if (!await canAccessProject(env, user, projectId, 'edit')) return json({ error: 'Editor access required for this project.' }, 403);
  if (path === '/api/project-members' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT id,project_id AS projectId,email,role,status,created_at AS createdAt FROM project_invitations WHERE project_id=? ORDER BY created_at DESC').bind(projectId).all();
    return json({ members: result.results });
  }
  if (path === '/api/project-members' && request.method === 'POST') {
    const email = safeText(body?.email, 254).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (!['editor', 'viewer'].includes(body?.role)) return json({ error: 'Choose Viewer or Editor.' }, 400);
    if (email === user.email.toLowerCase()) return json({ error: 'You already have access to this project.' }, 409);
    const existing = await env.DB.prepare('SELECT id,status FROM project_invitations WHERE project_id=? AND email=?').bind(projectId,email).first();
    if (existing?.status === 'accepted') return json({ error: 'This member already has access. Update their role instead.' }, 409);
    const member = { id: existing?.id || id(), projectId, email, role: body.role, status: 'invited' };
    const token = crypto.randomUUID().replaceAll('-','') + crypto.randomUUID().replaceAll('-','');
    await env.DB.prepare("INSERT INTO project_invitations(id,project_id,email,role,status,token_hash,invited_by) VALUES (?,?,?,?,?,?,?) ON CONFLICT(project_id,email) DO UPDATE SET role=excluded.role, status='invited', token_hash=excluded.token_hash, invited_by=excluded.invited_by, created_at=CURRENT_TIMESTAMP").bind(member.id,projectId,email,member.role,'invited',await digest(token),user.id).run();
    const link = new URL('/',env.APP_ORIGIN || url.origin); link.searchParams.set('project', projectId); link.searchParams.set('invite', token);
    const result = await sendInviteEmail(env,request,{ to: email, inviterName: user.name, role: member.role, inviteUrl: link.href });
    await notifyUsers(env, user.id, { projectId, type:'member_invited', title:'Project invitation created', body:`${user.name} invited ${email} as ${member.role}` });
    return json({ ...member, inviteUrl: link.href, emailSent: result.sent, emailReason: result.reason }, 201);
  }
  const match = path.match(/^\/api\/project-members\/([a-zA-Z0-9-]+)$/);
  if (match && ['PATCH','DELETE'].includes(request.method)) {
    const member = await env.DB.prepare('SELECT * FROM project_invitations WHERE id=? AND project_id=?').bind(match[1],projectId).first();
    if (!member) return json({ error: 'Member not found in this project.' }, 404);
    const account = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(member.email).first();
    if (account?.id === user.id) return json({ error: 'You cannot remove your own project access.' }, 400);
    if (account?.id === project.createdBy) return json({ error:'The project owner’s access is protected.' },400);
    if (request.method === 'PATCH') {
      if (!['viewer','editor'].includes(body?.role)) return json({ error: 'Choose Viewer or Editor.' }, 400);
      const statements = [env.DB.prepare('UPDATE project_invitations SET role=? WHERE id=?').bind(body.role,member.id)];
      if (account && member.status === 'accepted') statements.push(env.DB.prepare('UPDATE project_memberships SET role=?,updated_at=CURRENT_TIMESTAMP WHERE project_id=? AND user_id=?').bind(body.role,projectId,account.id));
      await env.DB.batch(statements);
      await notifyUsers(env, user.id, { projectId, type:'member_role_updated', title:'Project access updated', body:`${user.name} changed a collaborator's role` });
      return json({ ok: true, role: body.role });
    }
    const statements = [env.DB.prepare('DELETE FROM project_invitations WHERE id=?').bind(member.id)];
    if (account && member.status === 'accepted') statements.push(env.DB.prepare('DELETE FROM project_memberships WHERE project_id=? AND user_id=?').bind(projectId,account.id));
    await env.DB.batch(statements);
    await notifyUsers(env, user.id, { projectId, type:'member_removed', title:'Project access removed', body:`${user.name} removed a collaborator's access` });
    return json({ ok: true });
  }
  return json({ error: 'Not found.' }, 404);
}
