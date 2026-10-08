import { json, parseJson } from './utils.js';

export function searchQuery(url, user) {
  const params = url.searchParams;
  const q = (params.get('q') || '').trim().slice(0,100);
  const limit = Math.min(50,Math.max(1,Number.parseInt(params.get('limit') || '20',10) || 20));
  const offset = Math.min(10000,Math.max(0,Number.parseInt(params.get('offset') || '0',10) || 0));
  const where = ['r.archived=0']; const values = [];
  if (!['admin','super_admin'].includes(user.role)) {
    where.push("EXISTS(SELECT 1 FROM project_memberships p WHERE p.project_id=r.project_id AND p.user_id=?)"); values.push(user.id);
  }
  if (params.get('project')) { where.push('r.project_id=?'); values.push(params.get('project')); }
  if (params.get('status')) { where.push('r.status=?'); values.push(params.get('status')); }
  if (q) {
    where.push("(r.title LIKE ? ESCAPE '\\' OR r.key LIKE ? ESCAPE '\\')");
    const pattern = `%${q.replace(/[\\%_]/g,char => '\\'+char)}%`; values.push(pattern,pattern);
  }
  return { where:where.join(' AND '),values,limit,offset };
}
export async function handleSearch(request,env,user) {
  if (request.method!=='GET' || new URL(request.url).pathname!=='/api/work/search') return null;
  const query = searchQuery(new URL(request.url),user);
  const [rows,count] = await env.DB.batch([
    env.DB.prepare(`SELECT r.id,r.key,r.title,r.status,r.stage,r.priority,r.assignee,r.assignees,r.due,r.project_id AS projectId,p.name AS projectName,r.estimate_hours AS estimateHours FROM reviews r JOIN projects p ON p.id=r.project_id WHERE ${query.where} ORDER BY r.updated_at DESC,r.id LIMIT ? OFFSET ?`).bind(...query.values,query.limit,query.offset),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM reviews r WHERE ${query.where}`).bind(...query.values)
  ]);
  return json({ items:rows.results.map(row => ({ ...row,assignees:parseJson(row.assignees,[]) })),total:count.results[0].total,limit:query.limit,offset:query.offset });
}
