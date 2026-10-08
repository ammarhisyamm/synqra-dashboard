import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret,decryptSecret,constantEqual } from '../worker/security.js';
import { normalizeAiResult } from '../worker/ai.js';
import { searchQuery } from '../worker/search.js';
import { teamWorkload,sprintTasks } from '../src/lib/reports.js';
import { drainFileCleanup,preserveAttachment } from '../worker/operations.js';

test('MFA encryption is authenticated and bound to its owner; missing key fails closed',async()=>{
  const env={ MFA_ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64') };
  const secret='A-PRIVATE-TEST-SECRET';
  const ciphertext=await encryptSecret(secret,env,'alice');
  assert.equal(await decryptSecret(ciphertext,env,'alice'),secret);
  assert.equal(ciphertext.includes(secret),false);
  await assert.rejects(decryptSecret(ciphertext,env,'bob'));
  await assert.rejects(encryptSecret(secret,{},'alice'));
  assert.equal(constantEqual('123','123'),true);assert.equal(constantEqual('123','124'),false);
});
test('AI output is bounded, validated and deduplicated, not blindly accepted',()=>{
  const { items,brief }=normalizeAiResult({ summary:'x',actionItems:[null,{}, { title:' Fix login ',due:'2026-02-30',priority:'unexpected' },{ title:'fix LOGIN' },{ title:'Another',description:'x'.repeat(5000),due:'2026-10-08' }] });
  assert.equal(items.length,2);assert.equal(items[0].due,'');assert.equal(items[0].priority,'Major');assert.equal(items[1].description.length,4000);assert.equal(items[1].due,'2026-10-08');assert.equal(brief.summary,'x');
  assert.throws(()=>normalizeAiResult(null));
});
test('search scopes membership and bounds pagination with literal wildcard escaping',()=>{
  const query=searchQuery(new URL('https://example.test/api/work/search?q=%25_&limit=100000&offset=-1'),{ id:'alice',role:'member' });
  assert.match(query.where,/project_memberships/);assert.equal(query.limit,50);assert.equal(query.offset,0);assert.equal(query.values[0],'alice');assert.equal(query.values[1],'%\\%\\_%');
  assert.doesNotMatch(searchQuery(new URL('https://example.test'),{ id:'admin',role:'admin' }).where,/project_memberships/);
});
test('report hours are shared without double counting and sprint names do not cross projects',()=>{
  const reviews=[{ projectId:'a',sprint:'Sprint 1',assignees:['Alice','Bob'],estimateHours:8 },{ projectId:'b',sprint:'Sprint 1',assignees:['Bob'],estimateHours:2 }];
  assert.equal(sprintTasks(reviews,{ projectId:'a',name:'Sprint 1' }).length,1);
  const workload=teamWorkload(reviews);assert.equal(workload.reduce((sum,row)=>sum+row.est,0),10);assert.equal(workload.find(row=>row.name==='Alice').est,4);
});
test('file cleanup preserves a still-linked object and retries R2 failure',async()=>{
  const deleted=[];const statements=[];
  const rows=[{ object_key:'live' },{ object_key:'orphan' },{ object_key:'retry' }];
  const env={ ATTACHMENTS:{ delete:async key=>{if(key==='retry')throw new Error('temporary');deleted.push(key);} },DB:{ prepare:sql=>({ bind(...values){this.values=values;return this;},async all(){return { results:rows };},async first(){return this.values[0]==='live'?{ id:'attachment' }:null;},async run(){statements.push({ sql,values:this.values });return { meta:{ changes:1 } };} }) } };
  await drainFileCleanup(env);
  assert.deepEqual(deleted,['orphan']);assert.ok(statements.some(row=>row.sql.startsWith('UPDATE file_cleanup') && row.values[0]==='retry'));assert.ok(statements.some(row=>row.sql.startsWith('DELETE FROM file_cleanup') && row.values[0]==='live'));
  deleted.length=0;statements.length=0;
  env.ATTACHMENTS.head=async()=>({etag:'source'});
  env.ATTACHMENTS.get=async()=>({body:new Blob(['source']).stream(),etag:'source',size:6});
  env.ATTACHMENT_BACKUPS={head:async()=>null,put:async()=>{throw new Error('Backup offline');}};
  await drainFileCleanup(env);
  assert.deepEqual(deleted,[],'A backup outage must never delete the original object');
  assert.ok(statements.some(row=>row.sql.startsWith('UPDATE file_cleanup') && row.values[0]==='orphan'));
});
test('attachment preservation streams a private backup and never deletes the source on backup failure',async()=>{
  const writes=[];
  const env={ DB:{prepare:()=>({bind(){return this;},run:async()=>({meta:{changes:1}})})},ATTACHMENTS:{get:async()=>({body:new Blob(['original']).stream(),etag:'etag1',size:8,httpMetadata:{contentType:'text/plain'}})},ATTACHMENT_BACKUPS:{head:async()=>null,put:async(key,body)=>writes.push([key,await new Response(body).text()])} };
  await preserveAttachment(env,'file-key');assert.deepEqual(writes,[['file-key','original']]);
  env.ATTACHMENT_BACKUPS.put=async()=>{throw new Error('Backup unavailable');};
  await assert.rejects(()=>preserveAttachment(env,'file-key'));
});
