import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, chmod, readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { encryptBackup,decryptBackup } from './backup-crypto.mjs';
import { workspaceRelease } from './release-id.mjs';
import { startNotetakerFixture } from './testing/notetaker-fixture.mjs';

const node=process.execPath;
const cli='node_modules/wrangler/bin/wrangler.js';
const directory=await mkdtemp('/tmp/synqra-qa-office-');
const database=directory+'/db';
const release=await workspaceRelease();
const run=(args,env={})=>new Promise((resolve,reject)=>{
  const child=spawn(node,args,{stdio:'inherit',env:{...process.env,...env}});
  child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`Verification command failed (${code ?? signal}): ${args[0]}`)));
});
await run(['node_modules/vite/bin/vite.js','build'],{ RELEASE_SHA:release });
await run([cli,'d1','migrations','apply','synqra-dashboard-data','--local','--persist-to',database]);
const port=await new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const base=`http://127.0.0.1:${port}`;
const testKey=Buffer.alloc(32,7).toString('base64'); // Disposable local encryption key; never deploy.
const notetaker=await startNotetakerFixture();
const server=spawn(node,[cli,'dev','--local','--ip','127.0.0.1','--port',String(port),'--persist-to',database,'--test-scheduled','--var',`MFA_ENCRYPTION_KEY:${testKey}`,'--var',`RELEASE_SHA:${release}`,'--var',`APP_ORIGIN:${base}`,'--var',`NOTETAKER_API_URL:${notetaker.url}`,'--var',`NOTETAKER_API_KEY:${notetaker.key}`,'--var',`NOTETAKER_SUMMARY_URL:${notetaker.url}`,'--var',`NOTETAKER_SUMMARY_KEY:${notetaker.key}`,'--var','APP_ENV:test'],{ stdio:'inherit' });
try {
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    if(server.exitCode!==null)throw new Error('Local Worker exited before readiness.');
    try{if((await fetch(base+'/api/health',{ signal:AbortSignal.timeout(1000) })).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,'Local Worker did not become ready.');
  await mkdir(directory+'/browser',{recursive:true});
  const env={ WORKER_TEST_URL:base,WORKER_TEST_DB_DIR:database,E2E_BASE_URL:base,E2E_REAL_WORKER:'1',NOTETAKER_FIXTURE_URL:notetaker.url,NOTETAKER_FIXTURE_KEY:notetaker.key,NOTETAKER_EVIDENCE_DIR:directory+'/browser' };
  // Integration suites share one disposable SQLite runtime; serialize writers.
  await run(['--test','--test-concurrency=1'],env);
  await run(['node_modules/@playwright/test/cli.js','test','e2e/real-worker-flow.spec.js','e2e/notetaker.spec.js','--project=chromium'],env);
  await run(['node_modules/@playwright/test/cli.js','test','e2e/core-flow.spec.js','e2e/ui-audit.spec.js','e2e/office-settings.spec.js','e2e/recovery.spec.js','e2e/notetaker.spec.js','e2e/project-knowledge.spec.js'],{...env,E2E_REAL_WORKER:'',E2E_CROSS_BROWSER:'1'});
  await run(['scripts/verify-release.mjs',base]);
  // Real export/import proof, against a second disposable local database.
  const sql=directory+'/restore.sql';
  // d1 export has no --persist-to option. An isolated config/state symlink
  // points its default local state at this test's database, never the checkout.
  const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  const exportDirectory=directory+'/export';
  await mkdir(exportDirectory+'/.wrangler',{ recursive:true });
  await symlink(database,exportDirectory+'/.wrangler/state','dir');
  const exportConfig=exportDirectory+'/wrangler.json';
  await writeFile(exportConfig,JSON.stringify({ name:'synqra-local-restore-proof',compatibility_date:config.compatibility_date,d1_databases:config.d1_databases }),{ mode:0o600 });
  await run([cli,'d1','export','synqra-dashboard-data','--config',exportConfig,'--local','--output',sql]);
  await chmod(sql,0o600);
  const original=await readFile(sql);
  const encrypted=await encryptBackup(original,Buffer.alloc(32,9));
  const decrypted=await decryptBackup(encrypted,Buffer.alloc(32,9));
  assert.deepEqual(original,decrypted,'Encrypted export differs after decryption');
  await writeFile(sql,decrypted,{mode:0o600});
  await run([cli,'d1','execute','synqra-dashboard-data','--local','--persist-to',directory+'/restored','--file',sql]);
  const query="SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS receipts FROM creation_receipts; SELECT COUNT(*) AS tasks FROM reviews; SELECT COUNT(*) AS documents FROM project_documents;";
  const counts=location=>JSON.parse(execFileSync(node,[cli,'d1','execute','synqra-dashboard-data','--local','--persist-to',location,'--command',query,'--json'],{ encoding:'utf8' })).map(result=>result.results);
  assert.deepEqual(counts(database),counts(directory+'/restored'),'Restored row counts differ');
  console.log('Local D1 restore proof passed. Evidence directory: '+directory);
} finally {
  server.kill('SIGTERM');
  await notetaker.close();
}
