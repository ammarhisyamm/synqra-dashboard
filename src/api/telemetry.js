const lastSent = new Map();
export function reportFailure(code) {
  const now=Date.now();
  if (now-(lastSent.get(code)||0)<60000) return;
  lastSent.set(code,now);
  // Never send user input, request payloads, error messages, or query strings.
  fetch('/api/telemetry',{ method:'POST',headers:{ 'content-type':'application/json' },body:JSON.stringify({ code }),keepalive:true }).catch(()=>{});
}
