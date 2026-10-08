import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup,decryptBackup } from '../scripts/backup-crypto.mjs';
test('backup encryption authenticates the file and fails closed for corruption or wrong keys',async()=>{
  const sql=Buffer.from('CREATE TABLE qa(id); INSERT INTO qa VALUES(42);');
  const key=Buffer.alloc(32,1);
  const sealed=await encryptBackup(sql,key);
  assert.equal(sealed.includes(sql),false);
  assert.deepEqual(await decryptBackup(sealed,key),sql);
  await assert.rejects(()=>decryptBackup(sealed,Buffer.alloc(32,2)));
  const corrupt=Buffer.from(sealed);corrupt[25]^=1;
  await assert.rejects(()=>decryptBackup(corrupt,key));
  await assert.rejects(()=>decryptBackup(Buffer.from('Not a backup'),key));
});
