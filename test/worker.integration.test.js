import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = process.env.WORKER_TEST_URL;
// Deliberate loopback-only gate: this suite creates disposable accounts/data.
test('real Worker → D1/R2: onboarding, invitations, task lifecycle and isolation', { skip: !base, timeout: 60000 }, async () => {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Integration tests must never mutate a remote workspace');
  const document = await fetch(base + '/');
  assert.match(document.headers.get('cache-control'), /no-store/);
  const markup = await document.text();
  const assetPath = markup.match(/src="(\/assets\/[^"\s]+\.js)"/)?.[1];
  assert.ok(assetPath, 'Requires a fresh production build');
  const asset = await fetch(base + assetPath);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  const stale = await fetch(base + '/assets/missing-previous-build.js');
  assert.equal(stale.status, 404);
  assert.match(stale.headers.get('cache-control'), /no-store/);
  assert.doesNotMatch(stale.headers.get('content-type'), /text\/html/);
  const suffix = crypto.randomUUID().slice(0, 8);
  async function request(account, path, body, method = body ? 'POST' : 'GET', status = 200) {
    const response = await fetch(base + path, { method, headers: { ...(account?.cookie ? { Cookie: account.cookie } : {}), Origin: base, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) }, body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined });
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${result.error || 'unexpected status'}`);
    return { ...result, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function register(name) {
    const email = `${name}-${suffix}@example.test`;
    const result = await request(null, '/api/auth/register', { name, email, password: crypto.randomUUID() + '!Qa' }, 'POST', 201);
    return { ...result.user, cookie: result.cookie };
  }
  const root = await register('root');
  if (root.role !== 'super_admin') {
    // Historical migrations seed a member; provision ONLY this fresh QA account
    // as admin in the explicit disposable local database, never via a public API.
    const directory = process.env.WORKER_TEST_DB_DIR;
    assert.ok(directory?.startsWith('/tmp/synqra-qa-'), 'An isolated QA D1 directory is required');
    assert.match(root.id, /^[a-f0-9-]{36}$/);
    execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'synqra-dashboard-data', '--local', '--persist-to', directory, '--command', `UPDATE users SET role='super_admin' WHERE id='${root.id}'`], { stdio: 'pipe' });
  }
  const owner = await register('owner');
  const viewer = await register('viewer');
  const outsider = await register('outsider');
  assert.equal(owner.role, 'member');
  const empty = await request(owner, '/api/bootstrap');
  assert.equal(empty.projects.length, 0);
  assert.equal(empty.reviews.length, 0);
  const project = await request(owner, '/api/projects', { name: `Private QA ${suffix}` }, 'POST', 201);
  const other = await request(outsider, '/api/projects', { name: `Other QA ${suffix}` }, 'POST', 201);
  const invite = await request(owner, '/api/project-members', { projectId: project.id, email: viewer.email, role: 'viewer' }, 'POST', 201);
  const token = new URL(invite.inviteUrl).searchParams.get('invite');
  assert.ok(token);
  await request(outsider, '/api/project-members/accept', { token }, 'POST', 403);
  await request(viewer, '/api/project-members/accept', { token });
  await request(viewer, '/api/project-members/accept', { token }, 'POST', 403);
  const visible = await request(viewer, '/api/bootstrap');
  assert.deepEqual(visible.projects.map(item => item.id), [project.id]);
  const team = await request(owner, `/api/team?project_id=${project.id}`);
  assert.deepEqual(team.team.map(item => item.id).sort(), [owner.id, viewer.id].sort());
  await request(outsider, `/api/team?project_id=${project.id}`, null, 'GET', 403);
  const meeting = await request(owner, '/api/meetings', { projectId: project.id, title: 'QA meeting', date: '2026-10-01', notes: 'Check the task flow' }, 'POST', 201);
  const taskInput = { projectId: project.id, title: 'QA task', priority: 'Major', area: 'Engineering', stage: 'Planning', status: 'Open', meetingId: meeting.id, assignees: [owner.name], estimateHours: 2.5 };
  await request(viewer, '/api/reviews', taskInput, 'POST', 403);
  const epic = await request(owner, '/api/metadata', { projectId: project.id, type:'epic', name:'QA epic', color:'#6366f1' }, 'POST', 201);
  await request(viewer, `/api/metadata/${epic.id}`, { name:'Not allowed' }, 'PATCH', 403);
  await request(owner, `/api/metadata/${epic.id}`, { name:'Updated QA epic' }, 'PATCH');
  const sprint = await request(owner, '/api/workflow/sprints', { projectId:project.id, name:'QA sprint', startDate:'2026-10-01', endDate:'2026-10-14' }, 'POST', 201);
  await request(viewer, `/api/workflow/sprints/${sprint.id}`, { status:'active' }, 'PATCH', 403);
  await request(owner, `/api/workflow/sprints/${sprint.id}`, { status:'active' }, 'PATCH');
  const task = await request(owner, '/api/reviews', taskInput, 'POST', 201);
  await request(outsider, `/api/reviews/${task.id}/details`, null, 'GET', 403);
  await request(viewer, `/api/reviews/${task.id}`, { status: 'Resolved' }, 'PATCH', 403);
  await request(owner, `/api/reviews/${task.id}`, { projectId: other.id }, 'PATCH', 400);
  await request(outsider, '/api/reviews', { ...taskInput, projectId: other.id }, 'POST', 400);
  await request(owner, `/api/reviews/${task.id}`, { estimateHours: -1 }, 'PATCH', 400);
  const updated = await request(owner, `/api/reviews/${task.id}`, { status: 'In Progress', assignees: [], estimateHours: 4.5 }, 'PATCH');
  assert.equal(updated.assignee, ''); assert.equal(updated.estimateHours, 4.5);
  await request(owner, `/api/reviews/${task.id}/comments`, { body: 'QA comment' }, 'POST', 201);
  const subtask = await request(owner, `/api/reviews/${task.id}/subtasks`, { title: 'QA subtask' }, 'POST', 201);
  await request(owner, `/api/reviews/${task.id}/subtasks/${subtask.id}`, { completed: true }, 'PATCH');
  const form = new FormData(); form.append('file', new Blob(['QA attachment'], { type: 'text/plain' }), 'qa.txt');
  const attachment = await request(owner, `/api/reviews/${task.id}/attachments`, form, 'POST', 201);
  const downloaded = await fetch(`${base}/api/attachments/${attachment.id}`, { headers: { Cookie: viewer.cookie } });
  assert.equal(downloaded.status, 200); assert.equal(await downloaded.text(), 'QA attachment');
  const details = await request(viewer, `/api/reviews/${task.id}/details`);
  assert.equal(details.review.status, 'In Progress'); assert.equal(details.comments.length, 1); assert.equal(details.subtasks[0].completed, true); assert.equal(details.attachments.length, 1);
  assert.ok(details.history.some(item => item.toStatus === 'In Progress'));
  const notifications = await request(viewer, '/api/notifications');
  assert.ok(notifications.notifications.some(item => item.reviewId === task.id && item.type === 'updated'));
  assert.equal((await request(outsider, '/api/notifications')).notifications.filter(item => item.reviewId === task.id).length, 0);
  await request(viewer, '/api/notifications/read-all', {});
  assert.ok((await request(viewer, '/api/notifications')).notifications.every(item => item.read));
  await request(owner, `/api/project-members/${invite.id}`, { projectId: project.id, role: 'editor' }, 'PATCH');
  await request(viewer, `/api/reviews/${task.id}`, { status: 'Resolved' }, 'PATCH');
  await request(owner, `/api/project-members/${invite.id}?project_id=${project.id}`, null, 'DELETE');
  await request(viewer, `/api/reviews/${task.id}/details`, null, 'GET', 403);
  assert.equal((await request(viewer, '/api/notifications')).notifications.filter(item => item.projectId === project.id).length, 0);
  assert.equal((await request(viewer, '/api/bootstrap')).unreadNotifications, 0, 'Revoked private-project notifications must not leave a badge');
  await request(root, `/api/projects/${project.id}`, { accessMode:'link' }, 'PATCH');
  const shared = await request(outsider, `/api/bootstrap?project=${project.id}`);
  assert.equal(shared.projects.find(item => item.id === project.id).role, 'viewer');
  await request(outsider, `/api/reviews/${task.id}/details`);
  await request(outsider, `/api/reviews/${task.id}`, { status:'Open' }, 'PATCH', 403);
  await request(root, `/api/projects/${project.id}`, { accessMode:'invite' }, 'PATCH');
  await request(owner, `/api/reviews/${task.id}`, { archived: true }, 'PATCH');
  assert.equal((await request(owner, '/api/bootstrap')).reviews.find(item => item.id === task.id).archived, 1);
  await request(owner, `/api/reviews/${task.id}`, { archived: false }, 'PATCH');
  await request(owner, `/api/reviews/${task.id}`, null, 'DELETE');
  await request(owner, `/api/meetings/${meeting.id}`, null, 'DELETE');
  // Only objects created above, only the isolated database; never production.
  await request(root, `/api/projects/${project.id}`, null, 'DELETE');
  await request(root, `/api/projects/${other.id}`, null, 'DELETE');
});
