import { lazy } from 'react';
const retry=new URLSearchParams(window.location.search).get('__synqra_retry');
let manifest;
export function lazyRoute(loader,exportName,entry) {
  return lazy(async()=>{
    let module;
    if(retry && import.meta.env.PROD){
      // Safari can retain a rejected immutable module URL across a reload.
      // Resolve a fresh entry from this build's manifest and retry a new URL.
      manifest ||= fetch('/asset-manifest.json',{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('Could not load the current asset manifest.');return response.json();});
      const asset=(await manifest)[entry]?.file;
      if(!/^assets\/[a-zA-Z0-9._-]+\.js$/.test(asset || ''))throw new Error('Current route is missing from the asset manifest.');
      module=await import(/* @vite-ignore */ '/'+asset+'?retry='+encodeURIComponent(retry));
    }else module=await loader();
    return {default:module[exportName]};
  });
}
