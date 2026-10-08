import { json, readBody, safeText, parseJson, id } from './utils.js';
import { canAccessProject } from './auth.js';
import { NotetakerError, parseMeetingUrl, notetakerReady, providerId, vexaRequest, normalizeCapture, meetingSummary } from './notetaker-provider.js';

export const liveCapture = status => !['completed','failed'].includes(status);
const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(byte => byte.toString(16).padStart(2,'0')).join('');
const sqlDate = date => date.toISOString().slice(0,19).replace('T',' ');
const captureRow = (env, meetingId) => env.DB.prepare('SELECT * FROM meeting_captures WHERE meeting_id=?').bind(meetingId).first();
function publicCapture(row) {
  if (!row) return null;
  return { status:row.status,platform:row.platform,meetingUrl:row.meeting_url,recordingEnabled:!!row.recording_enabled,transcript:row.transcript,
    segments:parseJson(row.segments,[]),recordings:parseJson(row.recordings,[]),summary:parseJson(row.summary,{}),summarySource:row.summary_source,
    errorCode:row.error_code,updatedAt:row.updated_at };
}
async function details(env, meeting) {
  const [capture, summary, shares] = await Promise.all([
    captureRow(env,meeting.id),env.DB.prepare('SELECT summary FROM meeting_summaries WHERE meeting_id=?').bind(meeting.id).first(),
    env.DB.prepare('SELECT id,created_at AS createdAt,expires_at AS expiresAt FROM meeting_shares WHERE meeting_id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC').bind(meeting.id).all()
  ]);
  return { capture:publicCapture(capture),summary:summary?.summary ?? parseJson(capture?.summary,{}).summary ?? '',shares:shares.results,
    configured:notetakerReady(env),localAiConfigured:!!env.NOTETAKER_SUMMARY_URL };
}
export async function syncCapture(env, row) {
  if (!row.provider_meeting_id) return;
  const lease = id();
  const claim = await env.DB.prepare("UPDATE meeting_captures SET sync_lease=?,sync_until=datetime('now','+90 seconds') WHERE meeting_id=? AND (sync_until IS NULL OR sync_until<CURRENT_TIMESTAMP)").bind(lease,row.meeting_id).run();
  if (!claim.meta.changes) return;
  try {
    const doc = await vexaRequest(env, `/transcripts/by-id/${row.provider_meeting_id}`);
    if (doc.platform !== row.platform || doc.native_meeting_id !== row.native_meeting_id) throw new NotetakerError('The server returned data from a different meeting.');
    const capture = normalizeCapture(doc,row.provider_meeting_id);
    const list = await vexaRequest(env, `/recordings?meeting_id=${row.provider_meeting_id}&limit=20&offset=0`);
    if (!Array.isArray(list.recordings) || list.has_more) throw new NotetakerError('Too many recordings to import safely. Export them from Vexa.');
    const recordings = list.recordings.filter(rec => providerId(rec.meeting_id) === row.provider_meeting_id && providerId(rec.id)).flatMap(rec =>
      (Array.isArray(rec.media_files) ? rec.media_files : []).filter(media => ['audio','video'].includes(media.type) && providerId(media.id)).map(media => ({ id:providerId(rec.id),mediaId:providerId(media.id),type:media.type,status:safeText(rec.status,30) }))
    ).slice(0,40);
    // Preserve user-written notes and summaries. A new provider poll must never overwrite them.
    await env.DB.prepare("UPDATE meeting_captures SET status=?,transcript=?,segments=?,recordings=?,error_code='',updated_at=CURRENT_TIMESTAMP,poll_after=datetime('now','+10 minutes') WHERE meeting_id=? AND sync_lease=?")
      .bind(capture.status,capture.transcript,JSON.stringify(capture.segments),JSON.stringify(recordings),row.meeting_id,lease).run();
    const fingerprint = await hash(capture.transcript);
    if (capture.status === 'completed' && capture.transcript && fingerprint !== row.summary_fingerprint && !row.summary_edited) {
      const summary = await meetingSummary(env,capture.transcript);
      await env.DB.prepare('UPDATE meeting_captures SET summary=?,summary_source=?,summary_fingerprint=? WHERE meeting_id=? AND sync_lease=? AND summary_edited=0')
        .bind(JSON.stringify(summary),summary.source,fingerprint,row.meeting_id,lease).run();
    }
  } catch (error) {
    await env.DB.prepare("UPDATE meeting_captures SET error_code=?,poll_after=datetime('now','+10 minutes') WHERE meeting_id=? AND sync_lease=?")
      .bind(error.status === 404 ? 'provider_pending' : 'sync_failed',row.meeting_id,lease).run();
    throw error;
  } finally { await env.DB.prepare('UPDATE meeting_captures SET sync_lease=NULL,sync_until=NULL WHERE meeting_id=? AND sync_lease=?').bind(row.meeting_id,lease).run(); }
}
export async function syncNotetakers(env) {
  if (!notetakerReady(env)) return;
  // Durable cursor/lease + the existing cron: no long-lived browser process in a Worker.
  // Continue checking completed runs for one day, so late recording/transcript chunks are saved.
  const rows = await env.DB.prepare("SELECT * FROM meeting_captures WHERE provider_meeting_id IS NOT NULL AND poll_after<=CURRENT_TIMESTAMP AND (status NOT IN ('completed','failed') OR created_at>datetime('now','-1 day')) ORDER BY poll_after LIMIT 10").all();
  for (const row of rows.results) await syncCapture(env,row).catch(() => {});
}
export async function activeProjectCapture(env, projectId) {
  return !!await env.DB.prepare("SELECT 1 FROM meeting_captures c JOIN meetings m ON m.id=c.meeting_id WHERE m.project_id=? AND c.status NOT IN ('completed','failed') LIMIT 1").bind(projectId).first();
}
export async function handlePublicMeeting(request, env) {
  if (new URL(request.url).pathname !== '/api/public/meetings/read' || request.method !== 'POST') return null;
  if (env.AUTH_RATE_LIMITER && !(await env.AUTH_RATE_LIMITER.limit({ key:'share:'+(request.headers.get('cf-connecting-ip') || 'unknown') })).success) return json({ error:'Too many requests. Please wait.' },429);
  const body = await readBody(request);
  if (!/^[a-f0-9]{64}$/.test(body?.token || '')) return json({ error:'This meeting link is invalid, expired, or revoked.' },404);
  const row = await env.DB.prepare('SELECT snapshot FROM meeting_shares WHERE token_hash=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP').bind(await hash(body.token)).first();
  return row ? json({ meeting:parseJson(row.snapshot,{}) }) : json({ error:'This meeting link is invalid, expired, or revoked.' },404);
}
export async function handleNotetaker(request, env, user) {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/api\/meetings\/([a-zA-Z0-9-]+)\/(capture|sync|stop|summary|shares|recording|reconcile)(?:\/([a-zA-Z0-9-]+))?$/);
  if (!match) return null;
  const [,meetingId,action,subId] = match;
  const meeting = await env.DB.prepare('SELECT id,title,date,notes,attendees,project_id AS projectId FROM meetings WHERE id=?').bind(meetingId).first();
  if (!meeting) return json({ error:'Meeting not found.' },404);
  const view = request.method === 'GET';
  if (!await canAccessProject(env,user,meeting.projectId,view ? 'view' : 'edit')) return json({ error:'You do not have access to this project.' },403);
  try {
    if (action === 'capture' && view && !subId) return json(await details(env,meeting));
    if (action === 'capture' && request.method === 'POST' && !subId) {
      const body = await readBody(request);
      if (body?.consent !== true) return json({ error:'Confirm that participants have been informed and recording is permitted before sending the bot.' },400);
      const link = parseMeetingUrl(body.meetingUrl);
      if (!notetakerReady(env)) throw new NotetakerError('Connect a self-hosted Vexa server first. No bot has been sent.',503);
      if (env.AI_RATE_LIMITER && !(await env.AI_RATE_LIMITER.limit({ key:'bot:'+user.id })).success) return json({ error:'Too many bot requests. Please wait.' },429);
      const old = await captureRow(env,meetingId);
      if (old && !(old.status === 'failed' && !old.provider_meeting_id)) return json({ error:'This meeting already has a capture session. Open its details; create a new meeting for a new call.' },409);
      try {
        const claim = await env.DB.prepare(`INSERT INTO meeting_captures(meeting_id,platform,native_meeting_id,meeting_url,consent_by,recording_enabled) VALUES(?,?,?,?,?,?)
          ON CONFLICT(meeting_id) DO UPDATE SET platform=excluded.platform,native_meeting_id=excluded.native_meeting_id,meeting_url=excluded.meeting_url,consent_by=excluded.consent_by,consent_at=CURRENT_TIMESTAMP,status='requested',error_code='',created_at=CURRENT_TIMESTAMP
          WHERE meeting_captures.status='failed' AND meeting_captures.provider_meeting_id IS NULL`)
          .bind(meetingId,link.platform,link.nativeId,link.url,user.id,1).run();
        if (!claim.meta.changes) return json({ error:'A bot request is already in progress.' },409);
      } catch (error) {
        if (/UNIQUE constraint/i.test(error.message)) return json({error:error.message.includes('meeting_capture_single_engine') ? 'The free Lite engine captures one meeting at a time. Stop and sync the current bot before sending another.' : 'This meeting link already has a bot in another session. No duplicate was sent.'},409);
        throw error;
      }
      let doc;
      try {
        doc = await vexaRequest(env,'/bots',{ method:'POST',body:{ platform:link.platform,native_meeting_id:link.nativeId,meeting_url:link.url,bot_name:'Synqra Notetaker (recording)',language:body.language === 'en' ? 'en' : 'id',task:'transcribe',recording_enabled:true,transcribe_enabled:true } });
        if (!providerId(doc.id) || doc.platform !== link.platform || doc.native_meeting_id !== link.nativeId) throw new NotetakerError('The bot server did not confirm the expected meeting session.',502,true);
        await env.DB.prepare('UPDATE meeting_captures SET provider_meeting_id=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE meeting_id=?').bind(providerId(doc.id),['requested','joining','awaiting_admission','active'].includes(doc.status) ? doc.status : 'requested',meetingId).run();
      } catch (error) {
        const uncertain = !(error instanceof NotetakerError) || error.ambiguous;
        await env.DB.prepare('UPDATE meeting_captures SET status=?,error_code=? WHERE meeting_id=?').bind(uncertain ? 'connection_unknown' : 'failed',uncertain ? 'unconfirmed_start' : 'start_failed',meetingId).run();
        throw error;
      }
      return json(await details(env,meeting),202);
    }
    if (action === 'sync' && request.method === 'POST' && !subId) {
      const row = await captureRow(env,meetingId); if (!row?.provider_meeting_id) return json({ error:'No confirmed bot session to sync. An admin can reconnect an unconfirmed request.' },409);
      if (env.AI_RATE_LIMITER && !(await env.AI_RATE_LIMITER.limit({key:'sync:'+user.id})).success) return json({error:'Please wait before syncing again.'},429);
      await syncCapture(env,row); return json(await details(env,meeting));
    }
    if (action === 'reconcile' && request.method === 'POST' && !subId) {
      if (!['admin','super_admin'].includes(user.role)) return json({error:'Admin access required.'},403);
      const row = await captureRow(env,meetingId); const body = await readBody(request); const target = providerId(body?.providerMeetingId);
      if (row?.status !== 'connection_unknown' || !target) return json({error:'Only an unconfirmed capture can be reconnected with its Vexa meeting ID.'},400);
      const doc = await vexaRequest(env,`/transcripts/by-id/${target}`);
      const startedAt = new Date(doc.start_time).getTime();
      if (doc.platform !== row.platform || doc.native_meeting_id !== row.native_meeting_id || !Number.isFinite(startedAt) || startedAt < new Date(row.created_at+'Z').getTime()-60000) return json({error:'That provider session does not match this capture request.'},409);
      normalizeCapture(doc,target);
      try { await env.DB.prepare('UPDATE meeting_captures SET provider_meeting_id=?,status=?,error_code=\'\' WHERE meeting_id=? AND status=\'connection_unknown\'').bind(target,doc.status,meetingId).run(); }
      catch (error) { if (/UNIQUE constraint/i.test(error.message)) return json({error:'That session is already linked to another meeting.'},409); throw error; }
      await syncCapture(env,await captureRow(env,meetingId)); return json(await details(env,meeting));
    }
    if (action === 'stop' && request.method === 'POST' && !subId) {
      const row = await captureRow(env,meetingId); if (!row?.provider_meeting_id || !liveCapture(row.status)) return json({ error:'No active confirmed bot to stop.' },409);
      // Stop is pair-addressed upstream: verify its active row before touching it.
      const running = await vexaRequest(env,'/bots/status');
      const bots = running.running || running.running_bots;
      if (!Array.isArray(bots) || !bots.some(bot => providerId(bot.id) === row.provider_meeting_id && bot.platform === row.platform && bot.native_meeting_id === row.native_meeting_id)) {
        await syncCapture(env,row); return json(await details(env,meeting));
      }
      await vexaRequest(env,`/bots/${row.platform}/${encodeURIComponent(row.native_meeting_id)}`,{ method:'DELETE' });
      await env.DB.prepare("UPDATE meeting_captures SET status='stopping',poll_after=CURRENT_TIMESTAMP WHERE meeting_id=?").bind(meetingId).run();
      return json(await details(env,meeting),202);
    }
    if (action === 'summary' && request.method === 'PATCH' && !subId) {
      const body = await readBody(request); if (typeof body?.summary !== 'string' || body.summary.length>4000) return json({ error:'Summary must contain at most 4,000 characters.' },400);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO meeting_summaries(meeting_id,summary) VALUES(?,?) ON CONFLICT(meeting_id) DO UPDATE SET summary=excluded.summary,updated_at=CURRENT_TIMESTAMP').bind(meetingId,body.summary.trim()),
        env.DB.prepare('UPDATE meeting_captures SET summary_edited=1 WHERE meeting_id=?').bind(meetingId)
      ]); return json(await details(env,meeting));
    }
    if (action === 'summary' && request.method === 'POST' && !subId) {
      const row = await captureRow(env,meetingId); const text = row?.transcript || meeting.notes;
      if (!text) return json({error:'Add notes or wait for a transcript before creating a summary.'},400);
      if (env.AI_RATE_LIMITER && !(await env.AI_RATE_LIMITER.limit({key:'summary:'+user.id})).success) return json({error:'Too many summary requests. Please wait.'},429);
      const summary = await meetingSummary(env,text);
      // Explicit regenerate replaces manual summary; automatic polling never does.
      await env.DB.batch([
        env.DB.prepare('INSERT INTO meeting_summaries(meeting_id,summary) VALUES(?,?) ON CONFLICT(meeting_id) DO UPDATE SET summary=excluded.summary,updated_at=CURRENT_TIMESTAMP').bind(meetingId,summary.summary),
        env.DB.prepare('UPDATE meeting_captures SET summary=?,summary_source=?,summary_edited=1 WHERE meeting_id=?').bind(JSON.stringify(summary),summary.source,meetingId)
      ]); return json({ ...await details(env,meeting),generated:summary });
    }
    if (action === 'shares' && request.method === 'POST' && !subId) {
      const body = await readBody(request);
      if (body?.confirmPublic !== true || ![1,7,30].includes(body.days)) return json({error:'Confirm sharing outside your project and choose a 1, 7, or 30-day expiry.'},400);
      const row = await captureRow(env,meetingId); const saved = await env.DB.prepare('SELECT summary FROM meeting_summaries WHERE meeting_id=?').bind(meetingId).first();
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
      const shareId = id(); const expiry = sqlDate(new Date(Date.now()+body.days*86400000));
      // Explicit snapshot, never provider IDs, join passwords, attendees, recordings or task descriptions.
      const snapshot = { title:meeting.title,date:meeting.date,notes:meeting.notes,summary:saved?.summary ?? parseJson(row?.summary,{}).summary ?? '',
        ...(body.includeTranscript === true ? { transcript:row?.transcript || '' } : {}),sharedAt:new Date().toISOString() };
      const claim = await env.DB.prepare(`INSERT INTO meeting_shares(id,meeting_id,token_hash,snapshot,created_by,expires_at)
        SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM meeting_shares WHERE meeting_id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP)<5`)
        .bind(shareId,meetingId,await hash(token),JSON.stringify(snapshot),user.id,expiry,meetingId).run();
      if (!claim.meta.changes) return json({error:'Revoke an existing share link before creating another (maximum 5).'},409);
      const url = new URL(env.APP_ORIGIN || request.url); url.pathname='/';url.search='';url.hash='meeting-share='+token;
      return json({id:shareId,shareUrl:url.toString(),expiresAt:expiry},201);
    }
    if (action === 'shares' && request.method === 'DELETE' && subId) {
      await env.DB.prepare('UPDATE meeting_shares SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND meeting_id=?').bind(subId,meetingId).run();
      return json({ok:true});
    }
    if (action === 'recording' && view && subId) {
      const row = await captureRow(env,meetingId); const type = new URL(request.url).searchParams.get('type') === 'video' ? 'video' : 'audio';
      const rec = parseJson(row?.recordings,[]).find(item=>item.id===subId && item.type===type);
      if (!rec) return json({error:'Recording is not ready. Sync the meeting and try again.'},404);
      const master = await vexaRequest(env,`/recordings/${rec.id}/master?type=${type}`);
      if (!providerId(master.media_file_id)) throw new NotetakerError('Recording is still processing.');
      const range = request.headers.get('range'); if (range && !/^bytes=\d*-\d*$/.test(range)) return json({error:'Unsupported byte range.'},416);
      const response = await vexaRequest(env,`/recordings/${rec.id}/media/${providerId(master.media_file_id)}/raw?type=${type}`,{range,stream:true});
      const contentType = response.headers.get('content-type') || '';
      if (!/^(audio|video)\//.test(contentType)) { await response.body?.cancel(); throw new NotetakerError('The server did not return playable media.'); }
      const headers = new Headers({ 'cache-control':'no-store','content-type':contentType,'content-disposition':'inline','referrer-policy':'no-referrer' });
      for (const key of ['content-length','content-range','accept-ranges']) if(response.headers.has(key))headers.set(key,response.headers.get(key));
      return new Response(response.body,{status:response.status,headers});
    }
    return json({error:'Not found.'},404);
  } catch (error) {
    if (error instanceof NotetakerError) return json({error:error.message},error.status);
    throw error;
  }
}
