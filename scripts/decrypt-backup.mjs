import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decryptBackup } from './backup-crypto.mjs';
const [input,output]=process.argv.slice(2);
if(!input || !output || resolve(input)===resolve(output))throw new Error('Pass an encrypted input and a different, NEW local .sql output.');
const plaintext=await decryptBackup(await readFile(input),Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || '','base64'));
await writeFile(output,plaintext,{mode:0o600,flag:'wx'});
console.log('Backup authenticated and decrypted locally. No remote database was modified. Import into an isolated database first.');
