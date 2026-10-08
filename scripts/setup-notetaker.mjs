// Generates local engine secrets, never prints them and never replaces existing files.
import { randomBytes } from 'node:crypto';
import { mkdir,writeFile,access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const directory=fileURLToPath(new URL('../infra/notetaker/private/',import.meta.url));
for(const name of ['engine.env','database.env','summary.env','s3.json']) {
  let exists=false;try{await access(directory+name);exists=true;}catch{}
  if(exists)throw new Error(`Setup refused to overwrite ${name}. Keep existing keys and volumes together.`);
}
await mkdir(directory,{recursive:true,mode:0o700});
const secret=()=>randomBytes(32).toString('hex');
const db=secret(),storageKey=secret(),storageSecret=secret();
const values={DB_PASSWORD:db,MINIO_ACCESS_KEY:storageKey,MINIO_SECRET_KEY:storageSecret,ADMIN_API_TOKEN:secret(),INTERNAL_API_SECRET:secret(),VEXA_DISPATCH_SIGNING_KEY:secret(),NEXTAUTH_SECRET:secret(),JWT_SECRET:secret()};
// Bootstrap script consumes ADMIN_API_TOKEN; ADMIN_TOKEN must agree with it.
values.ADMIN_TOKEN=values.ADMIN_API_TOKEN;
await writeFile(directory+'engine.env',Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
await writeFile(directory+'database.env',`POSTGRES_PASSWORD=${db}\n`,{mode:0o600,flag:'wx'});
await writeFile(directory+'summary.env',`NOTETAKER_SUMMARY_KEY=${secret()}\n`,{mode:0o600,flag:'wx'});
await writeFile(directory+'s3.json',JSON.stringify({identities:[{name:'synqra-vexa',credentials:[{accessKey:storageKey,secretKey:storageSecret}],actions:['Admin','Read','List','Write','Tagging']}]},null,2)+'\n',{mode:0o600,flag:'wx'});
console.log('Generated private engine configuration (0700 directory / 0600 files). No services started and no paid account configured.');
