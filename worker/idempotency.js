import { digest } from './security.js';
import { json } from './utils.js';

export async function creationReceipt(env,user,kind,entityId,payload) {
  const hash = await digest(JSON.stringify(payload));
  const receipt = await env.DB.prepare('SELECT user_id,payload_hash FROM creation_receipts WHERE kind=? AND entity_id=?').bind(kind,entityId).first();
  if (receipt && (receipt.user_id !== user.id || receipt.payload_hash !== hash)) return { response:json({ error:'This creation ID belongs to a different request. Use a new ID.' },409) };
  return { replay:!!receipt,statement:env.DB.prepare('INSERT INTO creation_receipts(kind,entity_id,user_id,payload_hash) VALUES(?,?,?,?)').bind(kind,entityId,user.id,hash) };
}
