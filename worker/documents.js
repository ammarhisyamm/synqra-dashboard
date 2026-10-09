import { canAccessProject } from './auth.js';
import { id, json, readBody } from './utils.js';
import { creationReceipt } from './idempotency.js';

export const DOCUMENT_TYPES = ['general','retrospective','prd','meeting-notes','runbook'];
const columns = 'id,project_id AS projectId,title,type,content,epic_id AS epicId,sprint_id AS sprintId,archived,version,created_by AS createdBy,updated_by AS updatedBy,created_at AS createdAt,updated_at AS updatedAt';
export function documentPatch(body, creating = false) {
  const patch = {};
  if (creating || 'title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) throw new Error('Document title is required and must be at most 200 characters.');
    patch.title = body.title.trim();
  }
  if (creating || 'type' in body) {
    patch.type = body.type ?? 'general';
    if (!DOCUMENT_TYPES.includes(patch.type)) throw new Error('Invalid document type.');
  }
  if (creating || 'content' in body) {
    patch.content = body.content ?? '';
    if (typeof patch.content !== 'string' || patch.content.length > 20000) throw new Error('Document content must be text, up to 20,000 characters.');
  }
  for (const [key, column] of [['epicId','epic_id'],['sprintId','sprint_id']]) {
    if (creating || key in body) {
      const value = body[key] ?? '';
      if (typeof value !== 'string' || value.length > 80) throw new Error('Invalid document relation.');
      patch[column] = value || null;
    }
  }
  if ('archived' in body) {
    if (typeof body.archived !== 'boolean') throw new Error('Archived must be true or false.');
    patch.archived = Number(body.archived);
  }
  return patch;
}
async function relationError(env, patch, projectId, current) {
  for (const [column, table] of [['epic_id','project_metadata'],['sprint_id','sprints']]) {
    if (!patch[column]) continue;
    if (patch[column] === current?.[column === 'epic_id' ? 'epicId' : 'sprintId']) continue;
    const row = await env.DB.prepare(`SELECT project_id${column === 'epic_id' ? ', type, archived' : ''} FROM ${table} WHERE id=?`).bind(patch[column]).first();
    if (!row || row.project_id !== projectId || (column === 'epic_id' && (row.type !== 'epic' || row.archived))) return 'Epic and sprint must belong to this project; the epic must be active.';
  }
  return null;
}
export async function handleDocuments(request, env, user) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/documents\/([a-zA-Z0-9-]{1,80})$/);
  if (url.pathname !== '/api/documents' && !match) return null;
  if (request.method === 'GET' && !match) {
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return json({ error:'Choose a project first.' },400);
    if (!await canAccessProject(env,user,projectId)) return json({ error:'Project access required.' },403);
    const result = await env.DB.prepare(`SELECT ${columns} FROM project_documents WHERE project_id=? ORDER BY archived,updated_at DESC,id`).bind(projectId).all();
    return json({ documents:result.results });
  }
  if (request.method === 'POST' && !match) {
    const body = await readBody(request);
    if (!body || typeof body.projectId !== 'string' || !body.projectId || body.projectId.length > 80) return json({error:'Project and valid JSON are required.'},400);
    if (!await canAccessProject(env,user,body.projectId,'edit')) return json({error:'Project editor access required.'},403);
    if (!await env.DB.prepare('SELECT id FROM projects WHERE id=?').bind(body.projectId).first()) return json({error:'Project not found.'},404);
    let patch;
    try { patch = documentPatch(body,true); } catch (error) { return json({error:error.message},400); }
    const invalid = await relationError(env,patch,body.projectId);
    if (invalid) return json({error:invalid},400);
    if (body.id != null && (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(body.id))) return json({error:'Invalid creation ID.'},400);
    const documentId = body.id || id();
    const receipt = await creationReceipt(env,user,'document',documentId,{projectId:body.projectId,...patch});
    if (receipt.response) return receipt.response;
    const replay = async () => {
      const saved = await env.DB.prepare(`SELECT ${columns} FROM project_documents WHERE id=?`).bind(documentId).first();
      return saved ? json(saved,201) : json({error:'This document was deleted. Use a new creation ID.'},410);
    };
    if (receipt.replay) return replay();
    try {
      await env.DB.batch([receipt.statement,env.DB.prepare('INSERT INTO project_documents (id,project_id,title,type,content,epic_id,sprint_id,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(documentId,body.projectId,patch.title,patch.type,patch.content,patch.epic_id,patch.sprint_id,user.id,user.id)]);
    } catch (failure) {
      const raced = await creationReceipt(env,user,'document',documentId,{projectId:body.projectId,...patch});
      if (raced.response) return raced.response;
      if (raced.replay) return replay();
      throw failure;
    }
    return json(await env.DB.prepare(`SELECT ${columns} FROM project_documents WHERE id=?`).bind(documentId).first(),201);
  }
  if (match && request.method === 'PATCH') {
    const current = await env.DB.prepare(`SELECT ${columns} FROM project_documents WHERE id=?`).bind(match[1]).first();
    if (!current) return json({error:'Document not found.'},404);
    if (!await canAccessProject(env,user,current.projectId,'edit')) return json({error:'Project editor access required.'},403);
    const body = await readBody(request);
    if (!body || !Number.isSafeInteger(body.version) || body.version < 1) return json({error:'Document version is required. Reload before saving.'},400);
    let patch;
    try { patch = documentPatch(body); } catch (error) { return json({error:error.message},400); }
    const keys = Object.keys(patch);
    if (!keys.length) return json({error:'No changes supplied.'},400);
    const invalid = await relationError(env,patch,current.projectId,current);
    if (invalid) return json({error:invalid},400);
    const result = await env.DB.prepare(`UPDATE project_documents SET ${keys.map(key => `${key}=?`).join(',')},version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?`).bind(...keys.map(key => patch[key]),user.id,current.id,body.version).run();
    if (!result.meta.changes) return json({error:'This document changed in another session. Your edits are kept. Reload the latest version before saving.'},409);
    return json(await env.DB.prepare(`SELECT ${columns} FROM project_documents WHERE id=?`).bind(current.id).first());
  }
  return json({error:'Method not allowed.'},405);
}
