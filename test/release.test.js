import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
async function verifyFixture(overrides = {}) {
  const routes = {
    '/release.json': [200, 'application/json', JSON.stringify({ release:'qa-release' })],
    '/api/health': [200, 'application/json', JSON.stringify({ release:'qa-release', environment:'test' })],
    '/': [200, 'text/html', '<script src="/assets/main.js"></script><link href="/assets/main.css" rel="stylesheet">'],
    '/asset-manifest.json': [200, 'application/json', JSON.stringify({ main:{ file:'assets/main.js', css:['assets/main.css'] }, lazy:{ file:'assets/lazy.js', css:['assets/lazy.css'] } })],
    '/assets/main.js': [200, 'application/javascript', 'export const main=1;'],
    '/assets/main.css': [200, 'text/css', 'body{color:black}'],
    '/assets/lazy.js': [200, 'application/javascript', 'export const lazy=1;'],
    '/assets/lazy.css': [200, 'text/css', '.lazy{display:flex}'],
    '/api/bootstrap': [401, 'application/json', '{}'],
    ...overrides,
  };
  const server = createServer((request, response) => {
    const [status, type, body] = routes[request.url] || [404, 'text/plain', 'Missing'];
    response.writeHead(status, { 'Content-Type':type });
    response.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(process.execPath, ['scripts/verify-release.mjs', `http://127.0.0.1:${server.address().port}`], {
      env:{ ...process.env, EXPECTED_RELEASE:'qa-release' }, timeout:20000,
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('release gate checks lazy JavaScript and CSS as well as the entry assets', async () => {
  const result = await verifyFixture();
  assert.equal(JSON.parse(result.stdout).assets, 4);
});
test('release gate rejects a missing lazy route', async () => {
  await assert.rejects(verifyFixture({ '/assets/lazy.js':[404, 'text/plain', 'Missing'] }), /lazy\.js/);
});
test('release gate rejects HTML served instead of lazy CSS', async () => {
  await assert.rejects(verifyFixture({ '/assets/lazy.css':[200, 'text/html', '<html>fallback</html>'] }), /lazy\.css/);
});
test('release gate rejects frontend/API version skew', async () => {
  await assert.rejects(verifyFixture({ '/api/health':[200, 'application/json', '{"release":"old"}'] }), /versions differ/);
});
