import { webcrypto } from 'node:crypto';
const magic=Buffer.from('SYNQRA01');
const context=Buffer.from('synqra-backup-v1');
async function keyFrom(bytes,usage) {
  if(bytes.length!==32)throw new Error('Backup key must contain exactly 32 bytes.');
  return webcrypto.subtle.importKey('raw',bytes,'AES-GCM',false,[usage]);
}
export async function encryptBackup(plaintext,keyBytes) {
  const nonce=webcrypto.getRandomValues(new Uint8Array(12));
  const cipher=await webcrypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:context},await keyFrom(keyBytes,'encrypt'),plaintext);
  return Buffer.concat([magic,Buffer.from(nonce),Buffer.from(cipher)]);
}
export async function decryptBackup(encrypted,keyBytes) {
  if(encrypted.length<36 || !encrypted.subarray(0,8).equals(magic))throw new Error('Not a Synqra encrypted backup.');
  return Buffer.from(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:encrypted.subarray(8,20),additionalData:context},await keyFrom(keyBytes,'decrypt'),encrypted.subarray(20)));
}
