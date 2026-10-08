import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
// Identify uncommitted staging builds by content, never pretend they are HEAD.
export async function workspaceRelease() {
  const hash=createHash('sha256');
  async function add(path){
    hash.update(path+'\0');hash.update(await readFile(path));
  }
  async function directory(path){
    const entries=await readdir(path,{withFileTypes:true});
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
      const file=path+'/'+entry.name;
      if(entry.isDirectory())await directory(file);else if(entry.isFile())await add(file);
    }
  }
  for(const folder of ['src','worker','migrations'])await directory(folder);
  for(const file of ['worker.js','index.html','package-lock.json','vite.config.js','wrangler.jsonc'])await add(file);
  let commit='uncommitted';
  try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:3000,stdio:['ignore','pipe','ignore']}).trim();}catch{ /* Content checksum still identifies this exact build. */ }
  return commit.slice(0,12)+'-workspace-'+hash.digest('hex').slice(0,16);
}
