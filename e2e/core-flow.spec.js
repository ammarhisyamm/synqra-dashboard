import { test, expect } from '@playwright/test';

const user = { id: 'user-e2e', name: 'E2E User', email: 'e2e@synqra.local', username: 'e2e', role: 'admin' };
const review = { id: 'review-e2e', key: 'AR-101', title: 'Verify task flow', area: 'Engineering', priority: 'Major', stage: 'Planning', status: 'Open', assignee: 'E2E User', due: '2026-09-20', archived: 0, projectId: 'default', labels: [], description: '' };
const bootstrap = {
  project: { id: 'default', name: 'Acme Redesign', description: '', accessMode: 'link', initials: 'A' },
  reviews: [review], meetings: [], spaces: [{ id: 'default', name: 'Main space', key: 'MAIN', description: '' }],
  projects: [{ id: 'default', spaceId: 'default', name: 'Acme Redesign', description: '', accessMode: 'link' }],
  workflowStatuses: [], sprints: [], metadata: [], unreadNotifications: 0, workload: [], reportByStatus: []
};

async function mockApi(page) {
  let signedIn = false;
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/auth/me') {
      return route.fulfill({ status: signedIn ? 200 : 401, contentType: 'application/json', body: JSON.stringify(signedIn ? { user } : { error: 'Sign in required.' }) });
    }
    if (url.pathname === '/api/auth/login' && request.method() === 'POST') {
      signedIn = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) });
    }
    if (url.pathname === '/api/bootstrap') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bootstrap) });
    if (url.pathname === '/api/team') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ team: [user] }) });
    if (url.pathname === '/api/notifications') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
    if (url.pathname === '/api/reviews/review-e2e/details') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ review, meeting: null, comments: [], subtasks: [], history: [], children: [], attachments: [], activity: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...review }) });
  });
}

async function signIn(page) {
  await page.getByLabel('Username or email').fill('e2e');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

test('auth and primary navigation flow', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await signIn(page);
  await page.getByRole('button', { name: 'Board', description: 'Board' }).click();
  await expect(page.getByRole('button', { name: /Create Task/ })).toBeVisible();
});

test('reviews list opens task detail', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await signIn(page);
  await page.getByRole('button', { name: 'All Reviews', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All Reviews' })).toBeVisible();
  await page.getByText('Verify task flow', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
});

test('new user can create a project and finish onboarding', async ({ page }) => {
  let project = null;
  let projects = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/auth/me') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) });
    if (url.pathname === '/api/bootstrap') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ project, projects, reviews: [], meetings: [], spaces: [], workflowStatuses: [], sprints: [], metadata: [], unreadNotifications: 0, workload: [], reportByStatus: [] }) });
    if (url.pathname === '/api/team') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ team: [] }) });
    if (url.pathname === '/api/project-members' && request.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ email: 'teammate@example.com', role: 'editor', emailSent: false }) });
    if (url.pathname === '/api/project-members') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: [] }) });
    if (url.pathname === '/api/projects' && request.method() === 'POST') {
      project = { id: 'project-new', name: 'New Project', description: '', accessMode: 'invite', initials: 'N' };
      projects = [project];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(project) });
    }
    if (url.pathname === '/api/notifications') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Create your first project' })).toBeVisible();
  await page.getByLabel('Project name').fill('New Project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Invite your team to New Project' })).toBeVisible();
  await page.getByLabel('Invite email').fill('teammate@example.com');
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByRole('button', { name: 'Finish setup' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});
