// Test double for the reviewed Vexa HTTP contract. Never joins or records a call.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

export async function startNotetakerFixture() {
  const key = randomBytes(32).toString('hex');
  const bots = new Map(); const modes = new Map(); let serial = 100; let starts = 0; let localAi = false;
  const server = createServer(async (request,response) => {
    const send = (body,status=200) => {response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify(body));};
    const url = new URL(request.url,'http://localhost');
    const authorized = url.pathname === '/api/generate' ? request.headers.authorization === `Bearer ${key}` : request.headers['x-api-key'] === key;
    if (!authorized) return send({error:'Fixture key required'},401);
    let body = ''; for await (const chunk of request) body += chunk;
    const input = body ? JSON.parse(body) : {};
    if (url.pathname === '/__fixture') {
      if (typeof input.localAi === 'boolean') localAi = input.localAi;
      if (input.nativeId) modes.set(input.nativeId,input.mode);
      if (input.id && bots.has(String(input.id))) Object.assign(bots.get(String(input.id)),input.patch);
      return send({starts,bots:[...bots.values()]});
    }
    if (url.pathname === '/api/generate') return localAi ? send({response:JSON.stringify({summary:'Local model fixture summary.',keyPoints:['Reviewed fixture point.'],actionItems:[]})}) : send({error:'Model unavailable'},503);
    if (url.pathname === '/bots' && request.method === 'POST') {
      const mode = modes.get(input.native_meeting_id);
      if (mode === 'capacity') return send({error:'Full'},429);
      starts++;
      const bot = {id:++serial,platform:input.platform,native_meeting_id:input.native_meeting_id,status:'active',start_time:new Date().toISOString(),segments:[{start:0,end:4,speaker:'QA Speaker',text:'Kita perlu memperbaiki alur onboarding minggu ini.'}]};
      bots.set(String(bot.id),bot);
      if (mode === 'invalid-json') {response.writeHead(201,{'content-type':'application/json'});return response.end('invalid JSON after accepting the bot');}
      return send(bot,201);
    }
    if (url.pathname === '/bots/status') return send({running:[...bots.values()].filter(bot=>bot.status==='active')});
    if (/^\/bots\/(google_meet|zoom)\//.test(url.pathname) && request.method === 'DELETE') {
      const [, ,platform,native] = url.pathname.split('/');
      const bot = [...bots.values()].find(bot=>bot.platform===platform && bot.native_meeting_id===native && bot.status==='active');
      if (!bot) return send({error:'Missing'},404);bot.status='completed';return send({ok:true});
    }
    const transcript = url.pathname.match(/^\/transcripts\/by-id\/(\d+)$/);
    if (transcript) {const bot=bots.get(transcript[1]);return send(bot || {error:'Missing'},bot?200:404);}
    if (url.pathname === '/recordings') {
      const bot=bots.get(url.searchParams.get('meeting_id'));
      return send({recordings:bot?.status==='completed'?[{id:bot.id*10,meeting_id:bot.id,status:'ready',media_files:[{id:bot.id*100,type:'audio'}]}]:[],has_more:false});
    }
    const master=url.pathname.match(/^\/recordings\/(\d+)\/master$/);
    if(master) return send({media_file_id:Number(master[1])*10,raw_url:'https://private-storage.invalid/secret-recording'});
    if (/^\/recordings\/\d+\/media\/\d+\/raw$/.test(url.pathname)) {
      // Tiny valid PCM WAV, generated solely for playback/proxy tests.
      const wav=Buffer.alloc(60);wav.write('RIFF');wav.writeUInt32LE(52,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16,40);
      const range=request.headers.range;
      if(range) {const match=range.match(/^bytes=(\d+)-(\d+)$/);if(!match)return send({},416);const start=Number(match[1]),end=Math.min(Number(match[2]),59);if(start>end)return send({},416);response.writeHead(206,{'content-type':'audio/wav','content-range':`bytes ${start}-${end}/60`,'accept-ranges':'bytes'});return response.end(wav.subarray(start,end+1));}
      response.writeHead(200,{'content-type':'audio/wav','accept-ranges':'bytes'});return response.end(wav);
    }
    send({error:'Unknown fixture endpoint'},404);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {key,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
