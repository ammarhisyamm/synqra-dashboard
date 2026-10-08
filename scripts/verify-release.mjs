import assert from 'node:assert/strict';

const base=process.argv[2] || process.env.RELEASE_URL;
if(!base)throw new Error('Pass the frontend deployment URL.');
const origin=new URL(base).origin;
const options=()=>({ signal:AbortSignal.timeout(45000),cache:'no-store' });
const get=async path=>{const response=await fetch(origin+path,options());assert.equal(response.status,200,path);return response;};
const [manifest,api]=await Promise.all([get('/release.json').then(r=>r.json()),get('/api/health').then(r=>r.json())]);
assert.ok(manifest.release && manifest.release!=='development','Frontend release missing');
assert.equal(api.release,manifest.release,'Frontend and API versions differ. Do not promote this deployment.');
if(process.env.EXPECTED_RELEASE)assert.equal(manifest.release,process.env.EXPECTED_RELEASE);
const html=await (await get('/')).text();
const entryAssets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+\.(?:js|css))"/g)].map(match=>match[1]);
assert.ok(entryAssets.length>=2,'JS and CSS references required');
const chunks=await(await get('/asset-manifest.json')).json();
assert.ok(Object.keys(chunks).length>0,'Build manifest is empty');
const assets=new Set(entryAssets);
for(const chunk of Object.values(chunks)){
  for(const file of [chunk.file,...(chunk.css||[])]){
    assert.match(file,/^assets\/[A-Za-z0-9_.-]+$/,'Unexpected build asset path');
    if(/\.(js|css)$/.test(file))assets.add('/'+file);
  }
}
// A route can fail long after login if its lazy JS/CSS was omitted from a release.
await Promise.all([...assets].map(async path=>{
  const response=await get(path);
  const type=response.headers.get('content-type')||'';
  assert.match(type,path.endsWith('.css')?/text\/css/:/(?:javascript|ecmascript)/,path);
  assert.ok((await response.arrayBuffer()).byteLength>0,'Empty asset: '+path);
}));
const privateResponse=await fetch(origin+'/api/bootstrap',options());
assert.equal(privateResponse.status,401,'Private bootstrap is exposed without authentication');
console.log(JSON.stringify({ release:manifest.release,environment:api.environment,assets:assets.size,verified:true }));
