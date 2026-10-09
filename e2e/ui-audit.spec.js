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
    if (path === '/api/telemetry') return send({ ok:true },202);
    if (path === '/api/account/security') return send({ activeSessions:1,mfaEnabled:false,mfaAvailable:false });
    if (path === '/api/account/preferences') return send({ preferences:{ activity:1,reminders:1,mentions:1 } });
    if (path === '/api/admin/operations') return send({ errors:[],feedback:[],cleanup:{ pending:0 } });
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
    if (/\/meetings\/[^/]+\/capture$/.test(path) && method === 'GET') return send({capture:null,summary:'',shares:[],configured:false,localAiConfigured:false});
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

for (const width of [1440, 768, 375]) {
  test(`shared UI contract survives route order, long labels and keyboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    const state = await fixture(page);
    state.data.meetings[0].title = 'Weekly planning with a very long meeting name and cross-functional project stakeholders';
    await page.reload();
    await navigate(page, 'All Reviews');
    const exportButton = page.getByRole('button', { name:'Export CSV', exact:true });
    const createButton = page.getByRole('button', { name:'Submit Review', exact:true });
    const a = await exportButton.boundingBox(), b = await createButton.boundingBox();
    const separation = Math.abs(a.y - b.y) < 2 ? b.x - a.x - a.width : b.y - a.y - a.height;
    expect(separation).toBeGreaterThanOrEqual(8);
    await createButton.click();
    const modal = page.getByRole('dialog', { name:'Create task' });
    const controlStyle = element => {
      const style = getComputedStyle(element);
      return { font:style.fontFamily, size:style.fontSize, weight:style.fontWeight, height:element.getBoundingClientRect().height };
    };
    const firstStyle = await modal.getByLabel('Title', { exact:true }).evaluate(controlStyle);
    expect(firstStyle).toMatchObject({ size:'13px', weight:'400', height:40 });
    const contrast = await modal.getByLabel('Title', { exact:true }).evaluate(element => {
      const luminance = color => {
        const channels = color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>value/255).map(value=>value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
        return channels.reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
      };
      const style = getComputedStyle(element);
      const placeholder = getComputedStyle(element,'::placeholder');
      const bg = luminance(style.backgroundColor), fg = luminance(placeholder.color);
      return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(await modal.locator('form').evaluate(el=>getComputedStyle(el).rowGap)).toBe('16px');
    await modal.getByRole('combobox', { name:'Status', exact:true }).click();
    const menu = page.getByRole('listbox');
    expect((await menu.boundingBox()).width).toBeGreaterThanOrEqual(160);
    await page.getByRole('option', { name:'In Progress', exact:true }).click();
    await expect(modal.locator('.app-select-label').first()).toHaveText('In Progress');
    await modal.getByRole('combobox', { name:'Related meeting', exact:true }).click();
    const longOption = page.getByRole('option', { name:state.data.meetings[0].title, exact:true });
    await expect(longOption).toBeVisible();
    expect(await longOption.evaluate(el=>el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await longOption.click();
    await page.screenshot({ path:`test-results/ui-audit/${width}-create-task.png` });
    await page.keyboard.press('Escape');

    await navigate(page, 'Meetings');
    const meetingButton = page.locator('.meeting-card-main').first();
    await meetingButton.focus();
    await page.keyboard.press('Enter');
    await expect(meetingButton).toHaveAttribute('aria-pressed','true');
    const tableWrap = page.locator('.meeting-action-table-wrap');
    expect(await tableWrap.evaluate(el=>el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(page.locator('.meeting-action-table').getByText('Major', { exact:true })).toBeVisible();
    await page.screenshot({ path:`test-results/ui-audit/${width}-meeting-long-content.png` });
    await page.getByRole('button', { name:'New meeting', exact:true }).click();
    await page.getByLabel('Meeting title', { exact:true }).fill('Audit meeting');
    await page.getByLabel('Meeting notes', { exact:true }).fill('Improve login layout.');
    await page.screenshot({ path:`test-results/ui-audit/${width}-meeting-editor.png` });
    await page.getByRole('button', { name:'Generate AI', exact:true }).click();
    await expect(page.getByRole('heading', { name:'AI Review', exact:true })).toBeVisible();
    // All four properties must remain editable without horizontal scrolling.
    for (const [field,value] of [['Priority','Minor'],['Status','Review'],['Assignee','QA User']]) {
      const trigger = page.getByRole('combobox', { name:`${field} of Improve login`, exact:true });
      await expect(trigger).toBeVisible();
      expect((await trigger.boundingBox()).x + (await trigger.boundingBox()).width).toBeLessThanOrEqual(width);
      await trigger.click();
      await page.getByRole('option', { name:value, exact:true }).click();
    }
    await expect(page.getByLabel('Due date of Improve login', { exact:true })).toBeVisible();
    await page.screenshot({ path:`test-results/ui-audit/${width}-AI-review.png` });
    await navigate(page, 'All Reviews');
    await createButton.click();
    expect(await modal.getByLabel('Title', { exact:true }).evaluate(controlStyle)).toEqual(firstStyle);
    await page.keyboard.press('Escape');
    await noOverflow(page);
    expect(state.errors).toEqual([]);
  });
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

test('task deep link opens authorized details and missing links fail without crashing the workspace',async({page})=>{
  const state=await fixture(page);
  await page.goto('/?project='+project.id+'&review='+baseTask.id);
  await expect(page.getByRole('dialog',{name:'Task details'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Copy task link'})).toBeVisible();
  await page.goto('/?project='+project.id+'&review=missing-task');
  await expect(page.getByText('This task is no longer available. Refresh your workspace.',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Task details'})).toHaveCount(0);
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

test('Kanban drag-and-drop persists a task stage through the update API', async ({ page }) => {
  const state = await fixture(page);
  await navigate(page, 'Board');

  const card = page.locator('.kanban-work-card').filter({ hasText: title });
  const reviewStage = page.locator('.kanban-stage').filter({ has: page.locator('header strong', { hasText: 'Review' }) });
  await expect(card).toBeVisible();
  await expect(reviewStage).toBeVisible();

  await card.dragTo(reviewStage);
  await expect.poll(() => state.changes.some(patch => patch.stage === 'Review')).toBe(true);
  await expect(reviewStage.locator('.kanban-work-card').filter({ hasText: title })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('Kanban filter menu keeps option labels visible and shares the menu surface', async ({ page }) => {
  await fixture(page);
  await navigate(page, 'Board');

  await page.getByRole('button', { name: 'Filter by status', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Filter by status', exact: true });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(220);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  for (const option of ['Open', 'In Progress', 'Review', 'Resolved', 'Rejected']) {
    await expect(menu.getByRole('menuitemcheckbox', { name: option, exact: true })).toBeVisible();
  }
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
  await page.route(/\/(?:src\/components\/reviews\/Reviews\.jsx|assets\/Reviews-[^/]+\.js)(?:\?.*)?$/, route => {
    if (!failed) { failed = true; return route.fulfill({status:404,contentType:'text/javascript',headers:{'cache-control':'no-store'},body:'// Missing stale chunk'}); }
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
      const heading = page.locator('.page-heading');
      if (await heading.count()) expect((await heading.boundingBox()).height).toBeLessThan(200);
      await noOverflow(page);
      if (width <= 820 && ['Reports','Admin Management'].includes(name)) {
        const cells = await page.locator('.responsive-record-table td[data-label]').evaluateAll(elements=>elements.map(el=>({ label:el.dataset.label,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width })));
        expect(cells.length).toBeGreaterThan(0);
        for (const cell of cells) {
          expect(cell.width, `${name}: ${cell.label} has space`).toBeGreaterThan(0);
          expect(cell.left, `${name}: ${cell.label} left edge`).toBeGreaterThanOrEqual(0);
          expect(cell.right, `${name}: ${cell.label} right edge`).toBeLessThanOrEqual(width+1);
        }
      }
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

test('mobile admin retains role and account actions, with keyboard-accessible confirmation', async ({ page }) => {
  await page.setViewportSize({ width:375, height:900 });
  const state = await fixture(page);
  await page.route('**/api/admin/users', route=>route.fulfill({ contentType:'application/json', body:JSON.stringify({ users:[user,{ id:'qa-member',name:'Long member name',email:'member@example.test',role:'member' }] }) }));
  await navigate(page,'Admin Management');
  await expect(page.locator('td[data-label="Role"]').first()).toBeVisible();
  const roleBox = await page.locator('td[data-label="Role"]').first().boundingBox();
  expect(roleBox.x + roleBox.width).toBeLessThanOrEqual(375);
  const promote = page.getByRole('button',{ name:'Promote',exact:true });
  await expect(promote).toBeVisible();
  const box = await promote.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await promote.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(promote).toBeFocused();
  await noOverflow(page);
  expect(state.errors).toEqual([]);
});

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
  await drawer.getByRole('button', { name:'Close task details' }).click();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('button', { name:'Start new meeting' })).toBeDisabled();
  await expect(page.getByRole('button', { name:'Submit new review' })).toBeDisabled();
  await expect(page.locator('.command-palette').getByRole('button', { name:'Admin Management' })).toHaveCount(0);
});

test('bootstrap failure hides cached workspace and recovers after retry', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => localStorage.setItem('synqra-dashboard-v1', JSON.stringify({ reviews:[{ title:'Other account private task' }], project:{ name:'Other account private project' } })));
  await page.route('**/api/bootstrap*', route => route.fulfill({ status:503, contentType:'application/json', body:JSON.stringify({ error:'QA workspace unavailable' }) }));
  await page.reload();
  await expect(page.getByText('Something went wrong', { exact:true })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await expect(page.getByText('Other account private task')).toHaveCount(0);
  await page.unroute('**/api/bootstrap*');
  await page.getByRole('button', { name:'Try again', exact:true }).click();
  await expect(page.getByRole('heading', { name:'Overview', exact:true })).toBeVisible();
});

test('mobile task title wraps and meeting properties stay inside the detail pane', async ({ page }) => {
  await page.setViewportSize({ width:375, height:900 });
  await fixture(page);
  await navigate(page, 'All Reviews');
  const titleButton = page.locator('.review-title-button').first();
  expect(await titleButton.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(page.locator('.review-mobile-meta').first()).toBeVisible();
  await page.setViewportSize({ width:768, height:900 });
  await navigate(page, 'Meetings');
  const table = page.locator('.meeting-action-table');
  const bounds = await table.boundingBox();
  const pane = await page.locator('.meeting-action-table-wrap').boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(pane.width + 1);
  expect(await table.locator('.meeting-action-title').first().evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (const text of ['Severity', 'Status', 'Due']) {
    const cell = table.locator(`td[data-label="${text}"]`).first();
    await expect(cell).toBeVisible();
    const box = await cell.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(pane.x + pane.width + 1);
  }
  await page.screenshot({ path:'test-results/ui-audit/768-meeting-cards.png', fullPage:true });
});

test('polling follows the selected project, not the original project', async ({ page }) => {
  const state = await fixture(page);
  const other = { ...project, id:'qa-other-project', name:'Other QA project', role:'editor' };
  state.data.projects.push(other);
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name:/QA project/ }).click();
  const response = page.waitForRequest(request => new URL(request.url()).pathname === '/api/bootstrap' && new URL(request.url()).searchParams.get('project') === other.id);
  await page.getByRole('button', { name:'Other QA project', exact:true }).click();
  await response;
  await expect(page.locator('.sidebar').getByRole('button', { name:/Other QA project/ })).toBeVisible();
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

test('meeting and search dialogs trap keyboard focus and restore their trigger', async ({ page }) => {
  await fixture(page, { meetingNotes:'First\nSecond\nThird\nFourth\nFifth\nSixth' });
  await navigate(page, 'Meetings');
  for (const [triggerName, dialogName] of [['Filter by date', 'Filter meetings by date'], ['View details', 'Meeting notes — QA weekly sync']]) {
    const trigger = page.getByRole('button', { name:triggerName, exact:true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name:dialogName, exact:true });
    await expect(dialog).toBeVisible();
    for (let index=0; index<8; index++) await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name:'Search and navigation' });
  await expect(palette).toBeVisible();
  for (let index=0; index<25; index++) await page.keyboard.press('Tab');
  expect(await palette.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
});

test('expired session clears private content and closes an open task drawer', async ({ page }) => {
  await fixture(page);
  await openDetail(page);
  await page.route('**/api/reviews/qa-task', route => route.fulfill({ status:401, contentType:'application/json', body:JSON.stringify({ error:'Sign in required.' }) }));
  const input = page.getByRole('dialog', { name:'Task details' }).getByLabel('Estimate (hours)', { exact:true });
  await input.fill('5');
  await input.press('Tab');
  await expect(page.getByRole('heading', { name:'Welcome back' })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('browser storage denial does not crash navigation or task creation', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem','setItem','removeItem']) Storage.prototype[method] = () => { throw new DOMException('Blocked storage', 'SecurityError'); };
  });
  const state = await fixture(page);
  await navigate(page, 'My Work');
  await page.getByRole('button', { name:'Create Task', exact:true }).click();
  const dialog = page.getByRole('dialog', { name:'Create task' });
  await dialog.getByLabel('Title', { exact:true }).fill('Storage-safe task');
  await dialog.getByRole('button', { name:'Create task', exact:true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('a delayed bootstrap response cannot overwrite a completed detail save', async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page);
  await openDetail(page);
  const stale = JSON.parse(JSON.stringify(state.data));
  let held;
  await page.route('**/api/bootstrap*', route => { held = route; });
  await page.clock.runFor(10000);
  await expect.poll(() => !!held).toBe(true);
  await page.clock.resume();
  const drawer = page.getByRole('dialog', { name:'Task details' });
  await drawer.getByLabel('Task title', { exact:true }).fill('Updated during polling');
  await drawer.getByLabel('Task title', { exact:true }).press('Tab');
  await expect.poll(() => state.changes.some(item => item.title === 'Updated during polling')).toBe(true);
  await held.fulfill({ contentType:'application/json', body:JSON.stringify(stale) });
  await drawer.getByRole('button', { name:'Close task details' }).click();
  await expect(page.locator('.review-title-button')).toHaveText('Updated during polling');
});

test('partial AI task failure keeps only failed items and retry never duplicates the meeting', async ({ page }) => {
  const state = await fixture(page);
  await page.route('**/api/ai/generate', route => route.fulfill({ contentType:'application/json', body:JSON.stringify({ items:['First task','Retry task'].map((title,index) => ({ id:`generated-${index}`, title, keep:true, status:'Open', priority:'Major', area:'Engineering', due:'' })) }) }));
  let failed = false;
  await page.route('**/api/reviews', route => {
    if (route.request().postDataJSON()?.title === 'Retry task' && !failed) {
      failed = true; return route.fulfill({ status:500, contentType:'application/json', body:JSON.stringify({ error:'Temporary failure' }) });
    }
    return route.fallback();
  });
  await navigate(page, 'Meetings');
  await page.getByRole('button', { name:'New meeting' }).click();
  await page.getByLabel('Meeting title', { exact:true }).fill('Retry meeting');
  await page.getByLabel('Meeting notes', { exact:true }).fill('First task and retry task');
  await page.getByRole('button', { name:'Generate AI' }).click();
  await page.getByRole('button', { name:'Create 2 items', exact:true }).click();
  await expect(page.getByRole('button', { name:'Create 1 item', exact:true })).toBeEnabled();
  expect(state.data.meetings.filter(item => item.title === 'Retry meeting')).toHaveLength(1);
  await page.getByRole('button', { name:'Create 1 item', exact:true }).click();
  await expect(page.getByRole('heading', { name:'1 task created' })).toBeVisible();
  expect(state.data.meetings.filter(item => item.title === 'Retry meeting')).toHaveLength(1);
  for (const title of ['First task','Retry task']) expect(state.data.reviews.filter(item => item.title === title)).toHaveLength(1);
  expect(state.errors).toEqual([]);
});
