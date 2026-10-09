import { json, id, readBody, safeText } from './utils.js';

export const releaseInfo = env => ({ release:env.RELEASE_SHA || 'development', environment:env.APP_ENV || 'development', schema:18 });
export const cleanupStatement = (env, key, delay = 0) => env.DB.prepare("INSERT INTO file_cleanup(object_key,next_attempt) VALUES(?,datetime('now',?)) ON CONFLICT(object_key) DO UPDATE SET next_attempt=excluded.next_attempt").bind(key,`+${delay} seconds`);

export async function preserveAttachment(env,key) {
  if(!env.ATTACHMENT_BACKUPS)return;
  const preserved=await env.ATTACHMENT_BACKUPS.head(key);
  if(preserved){await env.DB.prepare('INSERT OR IGNORE INTO attachment_backups(object_key,etag,size) VALUES(?,?,?)').bind(key,preserved.etag,preserved.size).run();return;}
  const object=await env.ATTACHMENTS.get(key);
  if(!object)throw new Error('Attachment missing before backup.');
  await env.ATTACHMENT_BACKUPS.put(key,object.body,{ httpMetadata:object.httpMetadata,customMetadata:{ sourceEtag:object.etag } });
  await env.DB.prepare('INSERT OR IGNORE INTO attachment_backups(object_key,etag,size) VALUES(?,?,?)').bind(key,object.etag,object.size).run();
}
export async function backupAttachments(env) {
  if(!env.ATTACHMENT_BACKUPS || !env.ATTACHMENTS)return;
  const rows=await env.DB.prepare('SELECT a.object_key FROM review_attachments a WHERE NOT EXISTS(SELECT 1 FROM attachment_backups b WHERE b.object_key=a.object_key) LIMIT 20').all();
  for(const row of rows.results)await preserveAttachment(env,row.object_key);
}

// The durable outbox commits with metadata deletion. R2 failures never resurrect
// deleted metadata or destroy a file whose D1 record is still live.
export async function drainFileCleanup(env) {
  if (!env.ATTACHMENTS) return;
  const rows = await env.DB.prepare('SELECT object_key FROM file_cleanup WHERE next_attempt<=CURRENT_TIMESTAMP ORDER BY next_attempt LIMIT 50').all();
  for (const row of rows.results) {
    try {
      const linked = await env.DB.prepare('SELECT id FROM review_attachments WHERE object_key=?').bind(row.object_key).first();
      if (!linked) {
        // Fail closed on backup failure. Keep the cleanup job for a later retry.
        // An upload reservation may have failed before creating an R2 object.
        if(env.ATTACHMENT_BACKUPS && await env.ATTACHMENTS.head(row.object_key))await preserveAttachment(env,row.object_key);
        await env.ATTACHMENTS.delete(row.object_key);
      }
      await env.DB.prepare('DELETE FROM file_cleanup WHERE object_key=?').bind(row.object_key).run();
    } catch {
      await env.DB.prepare("UPDATE file_cleanup SET attempts=attempts+1,next_attempt=datetime('now','+30 minutes') WHERE object_key=?").bind(row.object_key).run();
    }
  }
}
export async function recordOperationalEvent(env, category, code) {
  const allowed = new Set(['api','frontend','ai','maintenance']);
  if (!allowed.has(category)) return;
  // No request bodies, URLs with query strings, task titles, emails, or stacks.
  const safeCode = /^[a-z0-9_:-]{1,80}$/i.test(code) ? code : 'unknown';
  console.error(JSON.stringify({ event:'operational_failure',category,code:safeCode,...releaseInfo(env) }));
  try {
    await env.DB.prepare('INSERT INTO operational_events(id,category,code,release) VALUES(?,?,?,?)').bind(id(),category,safeCode,releaseInfo(env).release).run();
  } catch { /* Logging remains available during database outages. */ }
}
export async function sendDueReminders(env) {
  const rows = await env.DB.prepare(`SELECT r.id,r.project_id,r.title,r.due,u.id AS user_id
    FROM reviews r JOIN project_memberships p ON p.project_id=r.project_id JOIN users u ON u.id=p.user_id
    LEFT JOIN user_preferences pref ON pref.user_id=u.id
    WHERE r.archived=0 AND r.status NOT IN ('Resolved','Rejected') AND r.stage<>'Completed'
      AND r.due<>'' AND r.due<=date('now','+1 day') AND COALESCE(pref.reminders,1)=1
      AND (r.assignee=u.name OR EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(r.assignees) THEN r.assignees ELSE '[]' END) a WHERE a.value IN(u.name,u.email,u.username)))
      AND NOT EXISTS(SELECT 1 FROM reminder_delivery d WHERE d.review_id=r.id AND d.user_id=u.id AND d.due=r.due AND d.kind=CASE WHEN r.due<date('now') THEN 'overdue' ELSE 'due_soon' END)
    ORDER BY r.due LIMIT 100`).all();
  for (const row of rows.results) {
    const kind = row.due < new Date().toISOString().slice(0,10) ? 'overdue' : 'due_soon';
    // Conditional insert + delivery ledger in one D1 transaction, safe on retry.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO notifications(id,user_id,review_id,project_id,type,title,body)
        SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM reminder_delivery WHERE review_id=? AND user_id=? AND due=? AND kind=?)`).bind(id(),row.user_id,row.id,row.project_id,kind,kind==='overdue' ? 'Task overdue' : 'Task due soon',`${row.title} · Due ${row.due}`,row.id,row.user_id,row.due,kind),
      env.DB.prepare('INSERT OR IGNORE INTO reminder_delivery(review_id,user_id,kind,due) VALUES(?,?,?,?)').bind(row.id,row.user_id,kind,row.due)
    ]);
  }
}
export async function notifyMentions(env, projectId, reviewId, actorId, text) {
  const handles = [...new Set([...text.matchAll(/(?:^|\s)@([a-z0-9_-]{3,40})\b/gi)].map(match => match[1].toLowerCase()))].slice(0,20);
  if (!handles.length) return;
  const people = await env.DB.prepare(`SELECT u.id,u.username FROM users u JOIN project_memberships p ON p.user_id=u.id LEFT JOIN user_preferences pref ON pref.user_id=u.id WHERE p.project_id=? AND u.id<>? AND COALESCE(pref.mentions,1)=1`).bind(projectId,actorId).all();
  const recipients = people.results.filter(person => handles.includes(person.username?.toLowerCase()));
  if (recipients.length) await env.DB.batch(recipients.map(person => env.DB.prepare('INSERT INTO notifications(id,user_id,review_id,project_id,type,title,body) VALUES(?,?,?,?,?,?,?)').bind(id(),person.id,reviewId,projectId,'mentioned','You were mentioned','A teammate mentioned you in a task comment.')));
}
export async function maintenance(env) {
  for(const [code,job] of [['backup_failed',backupAttachments],['cleanup_failed',drainFileCleanup],['reminders_failed',sendDueReminders]]){
    try{await job(env);}catch{await recordOperationalEvent(env,'maintenance',code);}
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM operational_events WHERE created_at<datetime('now','-30 days')"),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<=CURRENT_TIMESTAMP'),
    env.DB.prepare('DELETE FROM password_resets WHERE expires_at<=CURRENT_TIMESTAMP OR used_at IS NOT NULL'),
    env.DB.prepare("DELETE FROM user_mfa WHERE enabled=0 AND created_at<datetime('now','-1 day')"),
    env.DB.prepare("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at<datetime('now','-90 days')")
  ]);
}
export async function handleOperations(request, env, user) {
  const path = new URL(request.url).pathname;
  if (path === '/api/telemetry' && request.method === 'POST') {
    const body = await readBody(request);
    if (!body || !['render_failure','chunk_failure','save_failure','network_failure'].includes(body.code)) return json({ error:'Unknown event.' },400);
    const result = env.TELEMETRY_RATE_LIMITER ? await env.TELEMETRY_RATE_LIMITER.limit({ key:user.id }) : { success:true };
    if (!result.success) return json({ ok:true },202);
    await recordOperationalEvent(env,'frontend',body.code);
    return json({ ok:true },202);
  }
  if (path === '/api/feedback' && request.method === 'POST') {
    const body = await readBody(request);
    const text = safeText(body?.body,2000);
    if (!text || !['bug','idea','help'].includes(body?.category)) return json({ error:'Choose a category and describe your feedback.' },400);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM office_feedback WHERE user_id=? AND created_at>datetime('now','-1 hour')").bind(user.id).first('count');
    if (recent>=10) return json({ error:'Please wait before submitting more feedback.' },429);
    await env.DB.prepare('INSERT INTO office_feedback(id,user_id,category,body) VALUES(?,?,?,?)').bind(id(),user.id,body.category,text).run();
    return json({ ok:true },201);
  }
  if (path === '/api/admin/operations' && request.method === 'GET') {
    if (!['admin','super_admin'].includes(user.role)) return json({ error:'Admin access required.' },403);
    const [errors,cleanup,feedback,activity] = await env.DB.batch([
      env.DB.prepare("SELECT category,code,COUNT(*) AS count,MAX(created_at) AS lastSeen FROM operational_events WHERE created_at>datetime('now','-7 days') GROUP BY category,code ORDER BY count DESC LIMIT 50"),
      env.DB.prepare('SELECT COUNT(*) AS pending,COALESCE(MAX(attempts),0) AS maxAttempts FROM file_cleanup'),
      env.DB.prepare('SELECT id,category,body,created_at AS createdAt FROM office_feedback ORDER BY created_at DESC LIMIT 50'),
      env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS activeUsers,COUNT(*) AS taskActions FROM review_activity WHERE created_at>datetime('now','-7 days')")
    ]);
    return json({ ...releaseInfo(env),errors:errors.results,cleanup:cleanup.results[0],feedback:feedback.results,adoption:activity.results[0], emailConfigured:!!env.RESEND_API_KEY,mfaConfigured:!!env.MFA_ENCRYPTION_KEY,attachmentBackupConfigured:!!env.ATTACHMENT_BACKUPS });
  }
  return null;
}
