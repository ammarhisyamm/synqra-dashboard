import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,copyFile,readFile,stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

test('self-host setup creates private random secrets without logging or overwriting them',async()=>{
  const directory=await mkdtemp('/tmp/synqra-notetaker-setup-test-');
  await mkdir(directory+'/scripts');
  await copyFile(new URL('../scripts/setup-notetaker.mjs',import.meta.url),directory+'/scripts/setup-notetaker.mjs');
  const output=execFileSync(process.execPath,[directory+'/scripts/setup-notetaker.mjs'],{encoding:'utf8'});
  const base=directory+'/infra/notetaker/private/';
  assert.equal((await stat(base)).mode & 0o777,0o700);
  const values=Object.fromEntries((await readFile(base+'engine.env','utf8')).trim().split('\n').map(line=>line.split('=')));
  for(const value of Object.values(values)){assert.match(value,/^[a-f0-9]{64}$/);assert.ok(!output.includes(value));}
  for(const name of ['engine.env','database.env','summary.env','s3.json'])assert.equal((await stat(base+name)).mode & 0o777,0o600);
  const storage=JSON.parse(await readFile(base+'s3.json','utf8'));
  assert.equal(storage.identities.length,1);assert.equal(storage.identities[0].credentials[0].accessKey,values.MINIO_ACCESS_KEY);
  const database=await readFile(base+'database.env','utf8');assert.equal(database,`POSTGRES_PASSWORD=${values.DB_PASSWORD}\n`);assert.ok(!database.includes(values.ADMIN_API_TOKEN));
  const before=await readFile(base+'engine.env','utf8');
  assert.throws(()=>execFileSync(process.execPath,[directory+'/scripts/setup-notetaker.mjs'],{stdio:'pipe'}));
  assert.equal(await readFile(base+'engine.env','utf8'),before);
});
test('Docker recipe pins images, isolates host ports and does not mount user credentials/socket',async()=>{
  const compose=await readFile(new URL('../infra/notetaker/compose.yaml',import.meta.url),'utf8');
  const images=[...compose.matchAll(/^\s+image:\s+(.+)$/gm)].map(match=>match[1]);
  assert.equal(images.length,6);for(const image of images)assert.match(image,/@sha256:[a-f0-9]{64}$/);
  assert.match(compose,/127\.0\.0\.1:8056:8056/);assert.match(compose,/127\.0\.0\.1:8057:8057/);
  assert.ok(!compose.includes('/var/run/docker.sock'));assert.ok(!compose.includes('.claude/'));
  assert.match(compose,/WHISPER__MODEL: Systran\/faster-whisper-tiny\n/);
  const gateway=await readFile(new URL('../infra/notetaker/gateway.conf.template',import.meta.url),'utf8');
  assert.match(gateway,/X-Admin-API-Key ""/);assert.match(gateway,/Bearer \$\{NOTETAKER_SUMMARY_KEY\}/);assert.match(gateway,/location \/ \{ return 404; \}/);
});
