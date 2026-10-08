import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { workspaceRelease } from './release-id.mjs';

const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const staging=config.env?.staging;
assert.ok(staging?.vars.APP_ENV==='staging','Explicit staging configuration required');
assert.notEqual(staging.d1_databases[0].database_id,config.d1_databases[0].database_id,'Staging must never reuse production D1');
assert.notEqual(staging.r2_buckets[0].bucket_name,config.r2_buckets[0].bucket_name,'Staging must never reuse production R2');
const release=await workspaceRelease();
const run=args=>execFileSync(process.execPath,args,{ stdio:'inherit',env:{ ...process.env,RELEASE_SHA:release } });
run(['node_modules/vite/bin/vite.js','build']);
run(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','synqra-staging-data','--remote','--env','staging']);
run(['node_modules/wrangler/bin/wrangler.js','deploy','--env','staging','--var',`RELEASE_SHA:${release}`]);
run(['scripts/verify-release.mjs',staging.vars.APP_ORIGIN]);
