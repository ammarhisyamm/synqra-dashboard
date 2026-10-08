import test from 'node:test';
import assert from 'node:assert/strict';
import { api, mutationState } from '../src/api/client.js';

test('mutation tracker covers pending writes, completion, failure, and GET exclusion', async () => {
  const original = globalThis.fetch;
  try {
    let release;
    globalThis.fetch = () => new Promise(resolve => { release = resolve; });
    const before = mutationState();
    const write = api('/api/reviews/qa', { method:'PATCH', body:'{}' });
    assert.equal(mutationState().pending, before.pending + 1);
    release(Response.json({ id:'qa' }));
    await write;
    assert.equal(mutationState().pending, before.pending);
    assert.equal(mutationState().revision, before.revision + 2);
    globalThis.fetch = async () => { throw new Error('Network failure'); };
    await assert.rejects(api('/api/reviews/qa', { method:'DELETE' }), /Network failure/);
    assert.equal(mutationState().pending, before.pending);
    const revision = mutationState().revision;
    globalThis.fetch = async () => Response.json({ ok:true });
    await api('/api/bootstrap');
    assert.equal(mutationState().revision, revision);
  } finally { globalThis.fetch = original; }
});

test('HTML, malformed JSON and non-object responses cannot masquerade as successful saves', async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response('<html>Proxy error</html>'), new Response('{', { headers:{ 'content-type':'application/json' } }), Response.json(null), Response.json([])]) {
      globalThis.fetch = async () => response;
      await assert.rejects(api('/api/reviews', { method:'POST', body:'{}' }), /unexpected response/);
      assert.equal(mutationState().pending, 0);
    }
    globalThis.fetch = async () => Response.json({ error:'Validation failed' }, { status:400 });
    await assert.rejects(api('/api/reviews'), error => error.status === 400 && error.message === 'Validation failed');
  } finally { globalThis.fetch = original; }
});

test('multipart uploads keep the browser-generated content type', async () => {
  const original = globalThis.fetch;
  try {
    const form = new FormData(); form.append('file', new Blob(['QA']), 'qa.txt');
    globalThis.fetch = async (path, options) => {
      assert.equal(options.headers['content-type'], undefined);
      assert.equal(options.body, form);
      return Response.json({ id:'attachment-qa' });
    };
    await api('/api/reviews/qa/attachments', { method:'POST', body:form });
    assert.equal(mutationState().pending, 0);
  } finally { globalThis.fetch = original; }
});
