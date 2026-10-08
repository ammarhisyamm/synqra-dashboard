import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, unlink, chmod } from 'node:fs/promises';
import { encryptBackup } from './backup-crypto.mjs';

const keyBytes=Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || '','base64');
if(keyBytes.length!==32)throw new Error('BACKUP_ENCRYPTION_KEY must be a base64 32-byte key. Never pass it as a command argument.');
const target=process.argv[2];
if(!['production','staging'].includes(target))throw new Error('Pass an explicit backup target: production or staging.');
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const binding=target==='staging' ? config.env.staging.d1_databases[0] : config.d1_databases[0];
const directory=await mkdtemp('/tmp/synqra-backup-');
const plaintext=directory+'/database.sql';
const out=process.env.BACKUP_OUTPUT || `synqra-${target}-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlaes`;
try {
  execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','export',binding.database_name,'--remote',...(target==='staging' ? ['--env','staging'] : []),'--output',plaintext],{ stdio:'inherit' });
  await chmod(plaintext,0o600);
  await writeFile(out,await encryptBackup(await readFile(plaintext),keyBytes),{ mode:0o600,flag:'wx' });
  console.log('Encrypted D1 backup written: '+out);
} finally { await unlink(plaintext).catch(()=>{}); }
