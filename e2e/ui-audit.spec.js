import { test, expect } from '@playwright/test';

const user = { id: 'qa-user', name: 'QA User', email: 'qa@example.test', username: 'qa', role: 'super_admin' };
const project = { id: 'qa-project', name: 'QA project', accessMode: 'invite', description: '' };
const title = 'Long task title that should wrap without colliding with metadata or clipping fields';
const baseTask = { id: 'qa-task', key: 'AR-101', title, projectId: project.id, priority: 'Major', area: 'Engineering', stage: 'In Progress', status: 'In Progress', assignee: user.name, assignees: [user.name], labels: [], description: 'Acceptance criteria', createdAt: '2026-10-01 02:38:00', due: '', estimateHours: 2.5, meetingId: 'qa-meeting' };

async function fixture(page, { empty = false, failCreate = false, failPatch = false, readOnly = false, meetingNotes = 'Fix the login layout. Add documentation.', meetingDate = '2026-10-01' } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const data = { project, projects: [project], reviews: empty ? [] : [{ ...baseTask }], meetings: [{ id: 'qa-meeting', title: 'QA weekly sync', projectId: project.id, date: meetingDate, notes: meetingNotes, ai: true, attendees: [user.name] }], spaces: [], metadata: [{ id: 'epic-qa', type: 'epic', name: 'UI quality', projectId: project.id, color: '#6366f1' }], sprints: [], workflowStatuses: [], workload: [], reportByStatus: [], unreadNotifications: 0 };
  const changes = [];
  data.project = { ...project, role: readOnly ? 'viewer' : 'editor' }; data.projects = [data.project];
  const details = { comments: [], subtasks: [], attachments: [], activity: [], history: [] };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const method = request.method();
    const payload = method !== 'GET' ? request.postDataJSON() : {};
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return send({ user: readOnly ? { ...user, role:'member' } : user });
    if (path === '/api/bootstrap') return send(data);
    if (path === '/api/team') return send({ team: [user, { name: 'Ammar Hisyam', email: 'ammar@example.test' }, { name: 'Erlangga', email: 'erlangga@example.test' }] });
    if (path === '/api/admin/users') return send({ users: [user] });
    if (path === '/api/notifications') return send({ notifications: [] });
    if (path === '/api/project-members') return send(method === 'POST' ? { ...payload, id: 'invite-qa', emailSent: false } : { members: [] });
    if (path === '/api/metadata') {
      if (method === 'POST') { const item = { id: 'new-meta', ...payload }; data.metadata.push(item); return send(item, 201); }
      return send({ metadata: data.metadata });
    }
    if (path === '/api/ai/generate') return send({ items: [{ id: 'generated-qa', title: 'Improve login', description: 'Improve responsive layout', priority: 'Major', area: 'Engineering', assignee: '', status: 'Open', due: '', keep: true }], brief: { source: 'test', summary: 'UI improvements' } });
    if (path === '/api/meetings' && method === 'POST') { const item = { id: 'new-meeting', ...payload }; data.meetings.push(item); return send(item, 201); }
    if (path === '/api/reviews' && method === 'POST') {
      if (failCreate) return send({ error: 'QA simulated create failure' }, 500);
      const item = { ...baseTask, ...payload, id: payload.id || 'new-task' }; data.reviews.push(item); return send(item, 201);
    }
    if (/\/reviews\/[^/]+\/details$/.test(path)) return send({ ...details, review: data.reviews.find(item => path.includes(item.id)), meeting: data.meetings[0] });
    if (/\/reviews\/[^/]+\/comments$/.test(path) && method === 'POST') { const item = { id: 'comment-qa', body: payload.body, name: user.name }; details.comments.push(item); return send(item, 201); }
    if (/\/reviews\/[^/]+\/subtasks$/.test(path) && method === 'POST') { const item = { id: 'subtask-qa', title: payload.title, completed: false }; details.subtasks.push(item); return send(item, 201); }
    if (/\/reviews\/[^/]+\/subtasks\/[^/]+$/.test(path) && method === 'PATCH') { Object.assign(details.subtasks[0], payload); return send(details.subtasks[0]); }
    if (/\/reviews\/[^/]+$/.test(path) && method === 'PATCH') {
      changes.push(payload);
      if (failPatch) return send({ error: 'QA simulated update failure' }, 500);
      const item = data.reviews.find(item => path.endsWith(item.id)); Object.assign(item, payload); return send(item);
    }
    if (/\/projects\/[^/]+$/.test(path) && method === 'PATCH') { Object.assign(project, payload); return send(project); }
    if (path === '/api/workflow/sprints' && method === 'POST') { const item = { id: 'qa-sprint', ...payload }; data.sprints.push(item); return send(item, 201); }
    throw new Error(`Unmocked endpoint: ${method} ${path}`);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  return { data, changes, errors };
}

async function navigate(page, name) {
  const button = page.locator('.sidebar').getByRole('button', { name, exact: true });
  if (page.viewportSize().width <= 650 && !await page.locator('.sidebar.open').count()) await page.getByRole('button', { name: 'Toggle menu' }).click();
  await button.click();
  if (name !== 'Board') await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
}
async function openDetail(page) {
  await navigate(page, 'All Reviews');
  await page.locator('.reviews-page').getByText(title, { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible();
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
}

test('detail before Board: aligned people menu, keyboard Escape, saved estimate and metadata', async ({ page }) => {
  const state = await fixture(page);
  await openDetail(page);
  const drawer = page.getByRole('dialog', { name: 'Task details' });
  expect((await drawer.boundingBox()).width).toBe(400);
  const assignees = drawer.getByRole('button', { name: 'Assignees', exact: true });
  const triggerBox = await assignees.boundingBox();
  await assignees.click();
  const menu = page.getByRole('menu', { name: 'Assignees' });
  await expect(menu.getByRole('menuitemcheckbox', { name: /Ammar Hisyam/ })).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(Math.abs(triggerBox.width - menuBox.width)).toBeLessThan(2);
  expect(Math.abs(triggerBox.x - menuBox.x)).toBeLessThan(2);
  expect(await menu.locator('.app-multi-avatar').first().evaluate(el => getComputedStyle(el).borderRadius)).toBe('50%');
  await menu.getByRole('menuitemcheckbox', { name: /Ammar Hisyam/ }).click();
  await expect(menu.getByRole('menuitemcheckbox', { name: /Ammar Hisyam/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Estimate (hours)', { exact: true }).fill('4.5');
  await drawer.getByLabel('Estimate (hours)', { exact: true }).press('Tab');
  await expect.poll(() => state.changes.some(patch => patch.estimateHours === 4.5)).toBe(true);
  await drawer.getByRole('combobox', { name: 'Epic', exact: true }).click();
  await page.getByRole('option', { name: 'UI quality' }).click();
  await expect(drawer.getByRole('combobox', { name: 'Epic', exact: true })).toHaveText(/UI quality/);
  await drawer.getByLabel('New subtask').fill('Check keyboard interaction');
  await drawer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(drawer.getByRole('checkbox', { name: 'Check keyboard interaction' })).toBeVisible();
  await drawer.getByRole('checkbox', { name: 'Check keyboard interaction' }).check();
  await drawer.getByLabel('New comment').fill('Looks good');
  await drawer.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(drawer.getByText('Looks good', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('failed task creation stays open, keeps input, never shows success', async ({ page }) => {
  await fixture(page, { failCreate: true });
  await navigate(page, 'My Work');
  await page.getByRole('button', { name: 'Create Task', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Create task' });
  await modal.getByLabel('Title', { exact: true }).fill('Retryable task');
  await expect(modal.getByLabel('Due date')).toHaveValue('');
  await modal.getByRole('button', { name: 'Create task' }).click();
  await expect(modal.getByRole('alert')).toHaveText(/QA simulated create failure/);
  await expect(modal.getByLabel('Title', { exact: true })).toHaveValue('Retryable task');
  await expect(page.getByRole('heading', { name: 'Review created' })).toHaveCount(0);
});

test('Meetings tolerates legacy records with missing date or notes', async ({ page }) => {
  await fixture(page, { meetingDate: null, meetingNotes: null });
  await navigate(page, 'Meetings');
  await expect(page.getByRole('heading', { name: 'Meetings', exact: true })).toBeVisible();
  await expect(page.getByText('No notes yet.', { exact: true })).toBeVisible();
  await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
});

test('create task dialog stays centered in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fixture(page);
  await navigate(page, 'My Work');
  await page.getByRole('button', { name: 'Create Task', exact: true }).click();

  const modal = page.getByRole('dialog', { name: 'Create task' });
  await expect(modal).toBeVisible();
  const box = await modal.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(Math.abs((box.x + box.width / 2) - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs((box.y + box.height / 2) - viewport.height / 2)).toBeLessThanOrEqual(1);
  await expect.poll(() => modal.evaluate(element => {
    const styles = getComputedStyle(element);
    const layer = element.closest('.ui-dialog-layer');
    const layerStyles = layer ? getComputedStyle(layer) : null;
    return {
      position: styles.position,
      transform: styles.transform,
      layerPosition: layerStyles?.position,
      layerInset: layerStyles?.inset,
      layerDisplay: layerStyles?.display,
    };
  })).toMatchObject({
    position: 'relative',
    transform: 'none',
    layerPosition: 'fixed',
    layerInset: '0px',
    layerDisplay: 'grid',
  });
});

test('failed detail save has an inline error and retry action', async ({ page }) => {
  await fixture(page, { failPatch: true });
  await openDetail(page);
  const drawer = page.getByRole('dialog', { name: 'Task details' });
  await drawer.getByLabel('Estimate (hours)', { exact: true }).fill('3');
  await drawer.getByLabel('Estimate (hours)', { exact: true }).press('Tab');
  await expect(drawer.getByRole('alert')).toHaveText(/not saved/);
  await expect(drawer.getByRole('button', { name: 'Retry save' })).toBeVisible();
});

test('My Work groups collapse and empty state does not duplicate sections', async ({ page }) => {
  await fixture(page);
  await navigate(page, 'My Work');
  await expect(page.locator('.my-work-group')).toHaveCount(1);
  await page.locator('.my-work-group summary').click();
  await expect(page.getByText(title, { exact: true })).toBeHidden();
  await page.locator('.my-work-group summary').press('Enter');
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});
test('empty My Work provides one clear call to action', async ({ page }) => {
  await fixture(page, { empty: true });
  await navigate(page, 'My Work');
  await expect(page.locator('.my-work-group')).toHaveCount(0);
  await expect(page.getByText('No assigned tasks yet')).toBeVisible();
});

test('All Reviews selection has checked and cleared states', async ({ page }) => {
  await fixture(page);
  await navigate(page, 'All Reviews');
  const all = page.getByRole('checkbox', { name: 'Select all matching reviews' });
  await all.check();
  await expect(all).toBeChecked();
  await expect(page.locator('.bulk-bar')).toHaveText(/1 selected/);
  await page.locator('.bulk-bar').getByRole('button', { name: 'Clear' }).click();
  await expect(all).not.toBeChecked();
  await expect(page.locator('.bulk-bar')).toHaveCount(0);
});

test('failed archive confirmation stays open and offers retry', async ({ page }) => {
  const state = await fixture(page, { failPatch:true });
  await navigate(page, 'All Reviews');
  await page.getByRole('button', { name:`Archive ${title}`, exact:true }).click();
  const dialog = page.getByRole('dialog', { name:'Archive this review?' });
  await dialog.getByRole('button', { name:'Archive', exact:true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(/Archive failed/);
  await expect(dialog.getByRole('button', { name:'Archive', exact:true })).toBeEnabled();
  await dialog.getByRole('button', { name:'Cancel' }).click();
  await expect(page.locator('.reviews-page').getByText(title, { exact:true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('failed bulk update keeps failed tasks selected for retry', async ({ page }) => {
  const state = await fixture(page, { failPatch:true });
  await navigate(page, 'All Reviews');
  await page.getByRole('checkbox', { name:'Select all matching reviews' }).check();
  await page.locator('.bulk-bar').getByRole('button', { name:'Archive', exact:true }).click();
  await expect(page.locator('.bulk-bar').getByRole('alert')).toHaveText(/1 changes were not saved/);
  await expect(page.locator('.bulk-bar')).toHaveText(/1 selected/);
  await expect(page.locator('.reviews-page').getByText(title, { exact:true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('project delete confirmation is responsive and preserves input after failure', async ({ page }) => {
  const state = await fixture(page);
  await page.setViewportSize({ width:375, height:900 });
  await page.route('**/api/projects/qa-project', route => route.request().method() === 'DELETE'
    ? route.fulfill({ status:500, contentType:'application/json', body:JSON.stringify({ error:'QA simulated delete failure' }) })
    : route.fallback());
  await navigate(page, 'Settings');
  await page.getByRole('button', { name:'Delete project', exact:true }).click();
  const dialog = page.getByRole('alertdialog', { name:'Delete project?' });
  await expect(dialog.getByRole('button', { name:'Delete project', exact:true })).toBeDisabled();
  await dialog.getByLabel('Type QA project to confirm').fill('QA project');
  await dialog.getByRole('button', { name:'Delete project', exact:true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(/QA simulated delete failure/);
  await expect(dialog.getByLabel('Type QA project to confirm')).toHaveValue('QA project');
  expect(await dialog.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
  await page.screenshot({ path:'test-results/ui-audit/375-delete-project.png' });
  await dialog.getByRole('button', { name:'Cancel' }).click();
  expect(state.errors).toEqual([]);
});

test('failed lazy route import can recover through an explicit reload', async ({ page }) => {
  await fixture(page);
  let failed = false;
  await page.route('**/src/components/reviews/Reviews.jsx*', route => {
    if (!failed) { failed = true; return route.abort('failed'); }
    return route.continue();
  });
  await page.locator('.sidebar').getByRole('button', { name:'All Reviews', exact:true }).click();
  await expect(page.getByText('Something went wrong', { exact:true })).toBeVisible();
  await page.getByRole('button', { name:'Try again', exact:true }).click();
  await expect(page.getByRole('heading', { name:'Overview', exact:true })).toBeVisible();
  await navigate(page, 'All Reviews');
  await expect(page.getByText('Something went wrong', { exact:true })).toHaveCount(0);
});

for (const width of [1440, 768, 375]) {
  test(`main pages and task drawer fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page);
    for (const name of ['My Work', 'All Reviews', 'Meetings', 'Reports', 'Archive', 'Settings', 'Admin Management', 'Board']) {
      await navigate(page, name);
      await expect(page.locator('.page').first()).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: `test-results/ui-audit/${width}-${name.replaceAll(' ', '-')}.png`, fullPage: true });
    }
    await page.locator('.kanban-view-tabs').getByRole('button', { name: 'List', exact: true }).click();
    const tabs = await page.locator('.kanban-view-tabs .view-tab').evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { left:r.left, right:r.right }; }));
    expect(tabs.every((tab,index) => !index || tab.left >= tabs[index - 1].right - 1)).toBe(true);
    await expect(page.locator('.kanban-list-view')).toBeVisible();
    await page.locator('.kanban-view-tabs').getByRole('button', { name: 'Sprint Planning' }).click();
    await expect(page.getByRole('heading', { name: 'Sprint planning' })).toBeVisible();
    await page.locator('.kanban-view-tabs').getByRole('button', { name: 'Gantt / Timeline' }).click();
    await expect(page.locator('.timeline-board')).toBeVisible();
    await noOverflow(page);
    await openDetail(page);
    const drawer = page.getByRole('dialog', { name: 'Task details' });
    expect((await drawer.boundingBox()).width).toBeLessThanOrEqual(Math.min(width, 400));
    await drawer.getByLabel('Estimate (hours)', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/ui-audit/${width}-detail.png` });
    const controls = await drawer.locator('.field-input,.app-select-trigger').evaluateAll(elements => elements.map(el => ({ w: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, left: el.getBoundingClientRect().left, size: getComputedStyle(el).fontSize })));
    expect(controls.every(control => control.w > 0 && control.left >= 0 && control.right <= width + 1)).toBe(true);
    expect(state.errors).toEqual([]);
  });
}

test('viewer can browse and filter, but task editing and creation are disabled', async ({ page }) => {
  await fixture(page, { readOnly:true });
  await navigate(page, 'My Work');
  await expect(page.getByRole('button', { name:'Create Task', exact:true })).toBeDisabled();
  await navigate(page, 'All Reviews');
  await expect(page.getByRole('button', { name:'Submit Review', exact:true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name:`Change phase of ${title}` })).toBeDisabled();
  await expect(page.getByRole('combobox', { name:'Filter by status' })).toBeEnabled();
  await openDetail(page);
  const drawer = page.getByRole('dialog', { name:'Task details' });
  await expect(drawer.getByLabel('Estimate (hours)', { exact:true })).toBeDisabled();
  await expect(drawer.getByRole('button', { name:'Close task details' })).toBeEnabled();
  await expect(drawer.getByRole('button', { name:'Delete', exact:true })).toHaveCount(0);
});

test('metadata dialogs have a surface, shared fields, color state and Escape dismissal', async ({ page }) => {
  const state = await fixture(page);
  await navigate(page, 'Board');
  for (const [button, type] of [['Epics','epic'], ['Features','feature'], ['Labels','label']]) {
    const trigger = page.getByRole('button', { name: new RegExp(`^${button}`) });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name:/Manage/ });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
    const input = dialog.getByRole('textbox', { name:`New ${type} name` });
    await input.fill(`QA ${type}`);
    const color = dialog.getByRole('button', { name:'Use color #4aa4e9', exact:true });
    // Colors are asserted through the actual palette rather than assuming a value.
    const palette = dialog.locator('.metadata-color');
    await palette.nth(1).click();
    await expect(palette.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name:'Add', exact:true }).click();
    await expect(dialog.getByText(`QA ${type}`, { exact:true })).toBeVisible();
    await page.screenshot({ path:`test-results/ui-audit/metadata-${type}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  expect(state.errors).toEqual([]);
});

test('generated AI preview supports assignee, priority and status before creation', async ({ page }) => {
  const state = await fixture(page);
  await navigate(page, 'Meetings');
  await expect(page.locator('.meeting-action-table tbody tr')).toHaveCount(1); // No duplicated note drafts.
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.getByLabel('Meeting title', { exact: true }).fill('QA generated meeting');
  await page.getByLabel('Meeting notes', { exact: true }).fill('Improve login layout and assign it to QA User.');
  await page.getByRole('button', { name: 'Generate AI' }).click();
  await expect(page.getByRole('heading', { name: 'AI Review' })).toBeVisible();
  for (const [field, value] of [['Assignee', 'QA User'], ['Priority', 'Minor'], ['Status', 'Review']]) {
    await page.getByRole('combobox', { name: `${field} of Improve login` }).click();
    await page.getByRole('option', { name: value, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Deselect All' }).click();
  await expect(page.getByRole('button', { name: 'Create 0 items' })).toBeDisabled();
  await page.getByRole('button', { name: 'Select All' }).click();
  await expect(page.getByRole('button', { name: 'Deselect All' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Create 1 item', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 task created' })).toBeVisible();
  const created = state.data.reviews.find(item => item.title === 'Improve login');
  expect(created).toMatchObject({ status: 'Review', priority: 'Minor', assignee: 'QA User' });
  expect(state.errors).toEqual([]);
});
