import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMeetingUrl,trustedBase,notetakerReady,providerId,normalizeCapture,boundedJson,vexaRequest,freeSummary,meetingSummary } from '../worker/notetaker-provider.js';

test('meeting links: canonicalize Meet and Zoom, keep only the required passcode',()=>{
  assert.deepEqual(parseMeetingUrl('https://meet.google.com/abc-defg-hij?authuser=1#chat'),{platform:'google_meet',nativeId:'abc-defg-hij',url:'https://meet.google.com/abc-defg-hij'});
  const zoom=parseMeetingUrl('https://us02web.zoom.us/j/12345678901?pwd=secret&tracking=private');
  assert.equal(zoom.platform,'zoom');assert.equal(zoom.nativeId,'12345678901');assert.equal(zoom.url,'https://us02web.zoom.us/j/12345678901?pwd=secret');
  assert.equal(parseMeetingUrl('https://zoom.us/wc/join/123456789').nativeId,'123456789');
});
test('meeting links reject unsupported hosts, credentials, ports and URL lookalikes',()=>{
  for(const value of [null,{},'javascript:alert(1)','http://meet.google.com/abc-defg-hij','https://meet.google.com.evil.test/abc-defg-hij','https://zoom.us.evil.test/j/123456789','https://evil.test@zoom.us/j/123456789','https://zoom.us:444/j/123456789','https://127.0.0.1/j/123456789','https://zoom.us/j/1','https://meet.google.com/lookup/example'])assert.throws(()=>parseMeetingUrl(value));
});
test('provider configuration requires HTTPS; HTTP loopback is test-only',()=>{
  assert.equal(notetakerReady({NOTETAKER_API_URL:'https://engine.example.test',NOTETAKER_API_KEY:'test'}),true);
  for(const url of ['http://engine.example.test','http://127.0.0.1:9000','https://key@engine.example.test','https://engine.example.test?key=test','ftp://127.0.0.1'])assert.equal(notetakerReady({NOTETAKER_API_URL:url,NOTETAKER_API_KEY:'test'}),false);
  assert.equal(trustedBase('http://127.0.0.1:9000',{APP_ENV:'test'}),'http://127.0.0.1:9000');
  assert.throws(()=>trustedBase('ftp://127.0.0.1',{APP_ENV:'test'}));
});
test('transcript import binds exact session and limits bytes and untrusted values',()=>{
  const doc={id:42,status:'completed',segments:[{text:' Hello ',speaker:'Alice',start:2,end:5},{text:null},{text:'World',start:-1,end:Infinity}]};
  assert.deepEqual(normalizeCapture(doc,'42').segments,[{text:'Hello',speaker:'Alice',start:2,end:5},{text:'World',speaker:'Speaker',start:0,end:0}]);
  assert.throws(()=>normalizeCapture(doc,'43'));assert.throws(()=>normalizeCapture({...doc,status:'made_up'},'42'));
  assert.throws(()=>normalizeCapture({...doc,segments:Array.from({length:2501},()=>({text:'text'}))},'42'));
  assert.throws(()=>normalizeCapture({...doc,segments:Array.from({length:100},()=>({text:'文'.repeat(1000)}))},'42'));
  assert.equal(providerId('../12'),'');assert.equal(providerId(0),'');assert.equal(providerId(42),'42');
});
test('bounded provider JSON rejects invalid and oversized bodies',async()=>{
  assert.deepEqual(await boundedJson(Response.json({ok:true})),{ok:true});
  await assert.rejects(boundedJson(new Response('bad JSON')));
  await assert.rejects(boundedJson(new Response('x'.repeat(20)),10));
});
test('accepted but unreadable bot response is ambiguous and cannot be safely retried',async()=>{
  const old=globalThis.fetch;const env={NOTETAKER_API_URL:'https://engine.example.test',NOTETAKER_API_KEY:'fixture-only'};
  try {
    globalThis.fetch=async (url,options)=>{assert.equal(options.headers['X-API-Key'],'fixture-only');assert.equal(options.redirect,'manual');return new Response('bad JSON',{status:201});};
    await assert.rejects(vexaRequest(env,'/bots',{method:'POST',body:{}}),error=>error.ambiguous===true);
    globalThis.fetch=async()=>new Response('{}',{status:429});
    await assert.rejects(vexaRequest(env,'/bots',{method:'POST',body:{}}),error=>error.status===429 && !error.ambiguous);
    globalThis.fetch=async()=>{throw new Error('private provider diagnostics');};
    await assert.rejects(vexaRequest(env,'/bots',{method:'POST',body:{}}),error=>error.ambiguous && !error.message.includes('private provider diagnostics'));
  }finally{globalThis.fetch=old;}
});
test('free summaries do not use paid APIs and local model failures fall back explicitly',async()=>{
  const old=globalThis.fetch;try {
    globalThis.fetch=async()=>{throw new Error('No external service may be called');};
    const text='Kita perlu memperbaiki onboarding.\nRapat berikutnya ditentukan nanti.';
    assert.equal((await meetingSummary({},text)).source,'extractive');assert.equal(freeSummary(text).actionItems.length,1);
    const fallback=await meetingSummary({NOTETAKER_SUMMARY_URL:'https://local-ai.example.test'},text);assert.equal(fallback.source,'extractive');assert.equal(fallback.fallback,true);
    globalThis.fetch=async()=>Response.json({response:JSON.stringify({summary:'Ringkasan',keyPoints:['Poin'],actionItems:['Tindak lanjut']})});
    assert.equal((await meetingSummary({NOTETAKER_SUMMARY_URL:'https://local-ai.example.test'},text)).source,'local-ai');
  }finally{globalThis.fetch=old;}
});
