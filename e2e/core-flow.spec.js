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
  await page.getByRole('button', { name: 'All Reviews', description: 'All Reviews' }).click();
  await expect(page.getByRole('heading', { name: 'All Reviews' })).toBeVisible();
  await page.getByText('Verify task flow', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
});
