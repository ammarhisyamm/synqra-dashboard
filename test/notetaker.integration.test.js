import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base=process.env.WORKER_TEST_URL;
const fixture=process.env.NOTETAKER_FIXTURE_URL;
test('notetaker real Worker/D1 integration with Vexa contract fixture (not a real call)',{skip:!base || !fixture,timeout:60000},async t=>{
  assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
  const suffix=crypto.randomUUID().slice(0,8);const password='Notetaker-test-'+crypto.randomUUID();
  const request=async(cookie,path,body,method=body?'POST':'GET',status=200)=>{
    const response=await fetch(base+path,{method,headers:{Origin:base,'cf-connecting-ip':'notetaker-'+suffix,...(cookie?{Cookie:cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const data=await response.json();assert.equal(response.status,status,`${path}: ${data.error}`);return {...data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const control=async body=>(await fetch(fixture+'/__fixture',{method:'POST',headers:{'X-API-Key':process.env.NOTETAKER_FIXTURE_KEY},body:JSON.stringify(body)})).json();
  const directory=process.env.WORKER_TEST_DB_DIR;assert.ok(directory?.startsWith('/tmp/synqra-qa-'));
  const sql=command=>JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','synqra-dashboard-data','--local','--persist-to',directory,'--command',command,'--json'],{encoding:'utf8'}));
  const owner=await request(null,'/api/auth/register',{name:'Capture owner '+suffix,email:`capture-${suffix}@example.test`,password},'POST',201);
  const outsider=await request(null,'/api/auth/register',{name:'Capture outsider '+suffix,email:`capture-outside-${suffix}@example.test`,password},'POST',201);
  const viewer=await request(null,'/api/auth/register',{name:'Capture viewer '+suffix,email:`capture-viewer-${suffix}@example.test`,password},'POST',201);
  const project=await request(owner.cookie,'/api/projects',{name:'Capture QA '+suffix},'POST',201);
  const create=()=>request(owner.cookie,'/api/meetings',{projectId:project.id,title:'Private meeting '+suffix,date:'2026-10-08',notes:'Private notes: kita perlu memperbaiki onboarding.',attendees:['Private participant']},'POST',201);
  const meeting=await create();const path=`/api/meetings/${meeting.id}`;
  assert.match(viewer.user.id,/^[a-f0-9-]{36}$/);assert.match(project.id,/^[a-f0-9-]{36}$/);
  sql(`INSERT INTO project_memberships(project_id,user_id,role) VALUES('${project.id}','${viewer.user.id}','viewer')`);
  await t.test('project-scoped authorization and viewer read-only',async()=>{
    assert.equal((await request(owner.cookie,path+'/capture')).configured,true);
    await request(outsider.cookie,path+'/capture',null,'GET',403);
    await request(null,path+'/capture',null,'GET',401);
    await request(viewer.cookie,path+'/summary',{summary:'Tampered'},'PATCH',403);
    await request(viewer.cookie,path+'/shares',{confirmPublic:true,days:7},'POST',403);
  });
  await t.test('recording consent, SSRF rejection and invalid requests',async()=>{
    await request(owner.cookie,path+'/capture',{meetingUrl:'https://meet.google.com/abc-defg-hij'},'POST',400);
    await request(owner.cookie,path+'/capture',{consent:true,meetingUrl:'https://private.internal/j/123456789'},'POST',400);
    await request(owner.cookie,path+'/summary',{summary:'x'.repeat(4001)},'PATCH',400);
    await request(owner.cookie,path+'/shares',{confirmPublic:false,days:7},'POST',400);
    await request(owner.cookie,path+'/shares',{confirmPublic:true,days:999},'POST',400);
  });
  await t.test('concurrent start sends exactly one bot and deletion is blocked while live',async()=>{
    const before=(await control({})).starts;
    const responses=await Promise.all([1,2].map(()=>fetch(base+path+'/capture',{method:'POST',headers:{Cookie:owner.cookie,Origin:base,'content-type':'application/json'},body:JSON.stringify({consent:true,meetingUrl:'https://meet.google.com/abc-defg-hij'})})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);assert.equal((await control({})).starts,before+1);
    await request(owner.cookie,path,null,'DELETE',409);
    await request(owner.cookie,`/api/projects/${project.id}`,null,'DELETE',409);
    await request(owner.cookie,path+'/capture',{consent:true,meetingUrl:'https://meet.google.com/abc-defg-hij'},'POST',409);
    const other=await create();await request(owner.cookie,`/api/meetings/${other.id}/capture`,{consent:true,meetingUrl:'https://meet.google.com/abc-defg-hij'},'POST',409);
    const beforeOther=(await control({})).starts;
    await request(owner.cookie,`/api/meetings/${other.id}/capture`,{consent:true,meetingUrl:'https://meet.google.com/def-ghij-klm'},'POST',409);
    assert.equal((await control({})).starts,beforeOther,'Shared Lite display/audio cannot capture two separate calls at once');
  });
  await t.test('capture imports transcript, stops exact session and saves a free summary',async()=>{
    const running=await request(owner.cookie,path+'/sync',{});assert.match(running.capture.transcript,/onboarding/);
    await request(owner.cookie,path+'/stop',{},'POST',202);
    const completed=await request(owner.cookie,path+'/sync',{});assert.equal(completed.capture.status,'completed');assert.equal(completed.capture.summarySource,'extractive');assert.equal(completed.capture.recordings.length,1);
    assert.ok(!JSON.stringify(completed).includes('private-storage.invalid'));assert.ok(!JSON.stringify(completed).includes(process.env.NOTETAKER_FIXTURE_KEY));
    await request(owner.cookie,path+'/stop',{},'POST',409);
  });
  await t.test('manual notes and summaries survive provider polls',async()=>{
    await request(owner.cookie,path,{notes:'Edited private notes'},'PATCH');
    await request(owner.cookie,path+'/summary',{summary:'Edited manual summary'},'PATCH');
    const synced=await request(owner.cookie,path+'/sync',{});assert.equal(synced.summary,'Edited manual summary');
    assert.equal((await request(owner.cookie,'/api/bootstrap')).meetings.find(m=>m.id===meeting.id).notes,'Edited private notes');
    assert.equal((await request(owner.cookie,path+'/summary',{})).generated.source,'extractive');
  });
  await t.test('local AI endpoint is optional and failure uses a labeled free draft',async()=>{
    await control({localAi:true});
    const generated=await request(owner.cookie,path+'/summary',{});assert.equal(generated.generated.source,'local-ai');assert.equal(generated.summary,'Local model fixture summary.');
    await control({localAi:false});
    const fallback=await request(owner.cookie,path+'/summary',{});assert.equal(fallback.generated.source,'extractive');assert.equal(fallback.generated.fallback,true);
  });
  let share,token;
  await t.test('public link is an opt-in snapshot without participants, join passwords or recording URLs',async()=>{
    share=await request(owner.cookie,path+'/shares',{confirmPublic:true,days:7},'POST',201);
    token=new URLSearchParams(new URL(share.shareUrl).hash.slice(1)).get('meeting-share');assert.match(token,/^[a-f0-9]{64}$/);
    const snapshot=(await request(null,'/api/public/meetings/read',{token})).meeting;
    assert.equal(snapshot.notes,'Edited private notes');assert.equal(snapshot.transcript,undefined);assert.equal(snapshot.attendees,undefined);assert.equal(snapshot.recordings,undefined);assert.equal(snapshot.meetingUrl,undefined);
    await request(owner.cookie,path,{notes:'Future private edit'},'PATCH');
    assert.equal((await request(null,'/api/public/meetings/read',{token})).meeting.notes,'Edited private notes');
    const rows=sql(`SELECT token_hash FROM meeting_shares WHERE id='${share.id}'`)[0].results;assert.notEqual(rows[0].token_hash,token);assert.match(rows[0].token_hash,/^[a-f0-9]{64}$/);
  });
  await t.test('revocation, expiry and unguessable invalid tokens',async()=>{
    await request(null,'/api/public/meetings/read',{token:'invalid'},'POST',404);
    await request(owner.cookie,path+'/shares/'+share.id,null,'DELETE');await request(null,'/api/public/meetings/read',{token},'POST',404);
    const expired=await request(owner.cookie,path+'/shares',{confirmPublic:true,days:1,includeTranscript:true},'POST',201);
    const expiredToken=new URLSearchParams(new URL(expired.shareUrl).hash.slice(1)).get('meeting-share');
    assert.match((await request(null,'/api/public/meetings/read',{token:expiredToken})).meeting.transcript,/onboarding/);
    sql(`UPDATE meeting_shares SET expires_at=datetime('now','-1 minute') WHERE id='${expired.id}'`);
    await request(null,'/api/public/meetings/read',{token:expiredToken},'POST',404);
  });
  await t.test('recording proxy is private, streams byte ranges, rejects invalid ranges',async()=>{
    const capture=(await request(owner.cookie,path+'/capture')).capture;const media=path+'/recording/'+capture.recordings[0].id;
    const response=await fetch(base+media,{headers:{Cookie:owner.cookie,Range:'bytes=0-15'}});
    assert.equal(response.status,206);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.arrayBuffer()).byteLength,16);
    await request(outsider.cookie,media,null,'GET',403);await request(null,media,null,'GET',401);
    assert.equal((await fetch(base+media,{headers:{Cookie:owner.cookie,Range:'bytes=1-3,5-8'}})).status,416);
    await request(owner.cookie,path+'/recording/999999',null,'GET',404);
  });
  await t.test('capacity failure permits retry but unknown accepted response does not',async()=>{
    const other=await create();const otherPath=`/api/meetings/${other.id}`;
    await control({nativeId:'xyz-abcd-uvw',mode:'capacity'});
    await request(owner.cookie,otherPath+'/capture',{consent:true,meetingUrl:'https://meet.google.com/xyz-abcd-uvw'},'POST',429);
    assert.equal((await request(owner.cookie,otherPath+'/capture')).capture.status,'failed');
    await control({nativeId:'xyz-abcd-uvw',mode:'invalid-json'});
    await request(owner.cookie,otherPath+'/capture',{consent:true,meetingUrl:'https://meet.google.com/xyz-abcd-uvw'},'POST',502);
    assert.equal((await request(owner.cookie,otherPath+'/capture')).capture.status,'connection_unknown');
    const started=(await control({})).starts;
    await request(owner.cookie,otherPath+'/capture',{consent:true,meetingUrl:'https://meet.google.com/xyz-abcd-uvw'},'POST',409);assert.equal((await control({})).starts,started);
    await request(owner.cookie,otherPath+'/reconcile',{providerMeetingId:String((await control({})).bots.at(-1).id)},'POST',403);
    sql(`UPDATE users SET role='super_admin' WHERE id='${owner.user.id}'`);
    const provider=(await control({})).bots.at(-1);
    await control({id:provider.id,patch:{start_time:'not a date'}});
    await request(owner.cookie,otherPath+'/reconcile',{providerMeetingId:String(provider.id)},'POST',409);
    await control({id:provider.id,patch:{start_time:new Date().toISOString()}});
    assert.equal((await request(owner.cookie,otherPath+'/reconcile',{providerMeetingId:String(provider.id)})).capture.status,'active');
    await request(owner.cookie,otherPath+'/stop',{},'POST',202);await request(owner.cookie,otherPath+'/sync',{});
  });
  await t.test('terminal captures and related snapshots are deleted with their project',async()=>{
    await request(owner.cookie,`/api/projects/${project.id}`,null,'DELETE');
    await request(owner.cookie,path+'/capture',null,'GET',404);
    assert.equal(sql(`SELECT COUNT(*) AS count FROM meeting_captures WHERE meeting_id='${meeting.id}'`)[0].results[0].count,0);
  });
});
