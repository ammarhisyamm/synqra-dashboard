import { test, expect } from '@playwright/test';

test('built application persists tasks and accepts a viewer invitation through the real Worker', async ({ page, browser }) => {
  test.skip(process.env.E2E_REAL_WORKER !== '1', 'Requires a disposable local Worker/D1/R2, not API mocks');
  test.setTimeout(60000);
  const staging=process.env.E2E_STAGING==='1';
  if(staging)expect(new URL(process.env.E2E_BASE_URL).origin).toBe('https://synqra-staging.ammarhisyam151.workers.dev');
  else {
    expect(['127.0.0.1','localhost']).toContain(new URL(process.env.E2E_BASE_URL).hostname);
    expect(process.env.WORKER_TEST_DB_DIR?.startsWith('/tmp/synqra-qa-')).toBe(true);
  }
  const suffix = crypto.randomUUID().slice(0,8);
  const name = `QA Owner ${suffix}`;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function register(target, displayName, email) {
    await target.getByRole('button', { name:'New to Synqra? Create an account' }).click();
    await target.getByLabel('Name', { exact:true }).fill(displayName);
    await target.getByLabel('Email', { exact:true }).fill(email);
    await target.getByLabel('Password', { exact:true }).fill(crypto.randomUUID() + '!Qa');
    await target.getByRole('button', { name:'Create account', exact:true }).click();
  }
  await page.goto('/');
  await register(page, name, `owner-ui-${suffix}@example.test`);
  await expect(page.getByRole('heading', { name:'Create your first project' })).toBeVisible();
  await page.getByLabel('Project name').fill(`Browser QA ${suffix}`);
  await page.getByRole('button', { name:'Create project', exact:true }).click();
  await expect(page.getByRole('heading', { name:`Invite your team to Browser QA ${suffix}` })).toBeVisible();
  await page.getByRole('button', { name:'Finish setup' }).click();
  await expect(page.getByRole('heading', { name:'Overview', exact:true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name:'My Work', exact:true }).click();
  await page.getByRole('button', { name:'Create Task', exact:true }).click();
  const modal = page.getByRole('dialog', { name:'Create task' });
  await modal.getByLabel('Title', { exact:true }).fill(`Persisted task ${suffix}`);
  await modal.getByRole('button', { name:'Assignees', exact:true }).click();
  await page.getByRole('menuitemcheckbox', { name }).click();
  await page.keyboard.press('Escape');
  await modal.getByRole('button', { name:'Create task', exact:true }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name:'View All Reviews' }).click();
  await page.locator('.reviews-page').getByText(`Persisted task ${suffix}`, { exact:true }).click();
  const drawer = page.getByRole('dialog', { name:'Task details' });
  await drawer.getByRole('combobox', { name:'Status', exact:true }).click();
  await page.getByRole('option', { name:'In Progress', exact:true }).click();
  await drawer.getByLabel('Estimate (hours)', { exact:true }).fill('3.5');
  await drawer.getByLabel('Estimate (hours)', { exact:true }).press('Tab');
  await expect.poll(async () => {
    // Secure localhost cookies are handled by Chromium, not Node's HTTP client.
    const data = await page.evaluate(async () => {
      const response = await fetch('/api/bootstrap', { cache:'no-store' });
      if (!response.ok) throw new Error(`Bootstrap failed: ${response.status}`);
      return response.json();
    });
    const task = data.reviews.find(item => item.title === `Persisted task ${suffix}`);
    return { status:task?.status, hours:task?.estimateHours, assignee:task?.assignee };
  }).toEqual({ status:'In Progress', hours:3.5, assignee:name });
  await drawer.getByLabel('New subtask').fill('Real subtask');
  await drawer.getByRole('button', { name:'Add', exact:true }).click();
  await drawer.getByRole('checkbox', { name:'Real subtask' }).check();
  await drawer.getByLabel('New comment').fill('Persisted browser comment');
  await drawer.getByRole('button', { name:'Comment', exact:true }).click();
  await expect(drawer.getByText('Persisted browser comment', { exact:true })).toBeVisible();
  await drawer.locator('input[type=file]').setInputFiles({ name:'browser-qa.txt', mimeType:'text/plain', buffer:Buffer.from('Real browser upload') });
  await expect(drawer.getByRole('link', { name:'browser-qa.txt' })).toBeVisible();
  await drawer.getByRole('button', { name:'Close task details' }).click();
  await page.locator('.sidebar').getByRole('button', { name:'Board', exact:true }).click();
  const card = page.locator('.kanban-work-card').filter({ hasText:`Persisted task ${suffix}` });
  const reviewColumn = page.locator('.kanban-stage').filter({ has:page.locator('header strong', { hasText:'Review' }) });
  await card.dragTo(reviewColumn);
  await expect.poll(async () => page.evaluate(async title => {
    const response = await fetch('/api/bootstrap', { cache:'no-store' });
    return (await response.json()).reviews.find(item => item.title === title)?.stage;
  }, `Persisted task ${suffix}`)).toBe('Review');
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name:'All Reviews', exact:true }).click();
  await page.locator('.reviews-page').getByText(`Persisted task ${suffix}`, { exact:true }).click();
  const reloaded = page.getByRole('dialog', { name:'Task details' });
  await expect(reloaded.getByRole('checkbox', { name:'Real subtask' })).toBeChecked();
  await expect(reloaded.getByText('Persisted browser comment', { exact:true })).toBeVisible();
  await expect(reloaded.getByRole('link', { name:'browser-qa.txt' })).toBeVisible();
  await reloaded.getByRole('button', { name:'Close task details' }).click();
  await page.locator('.sidebar').getByRole('button',{name:'Project Docs',exact:true}).click();
  await page.getByRole('button',{name:'New document'}).click();
  const documentDialog=page.getByRole('dialog',{name:'New document'});
  await documentDialog.getByLabel('Document title').fill(`Persisted doc ${suffix}`);
  await documentDialog.getByRole('button',{name:'Create document',exact:true}).click();
  await expect(documentDialog).toHaveCount(0);
  await page.getByLabel('Document content').fill('## Verified notes\n- Browser → API → D1 persisted');
  await page.getByRole('button',{name:'Save document',exact:true}).click();
  await expect(page.getByText('Document saved.',{exact:true})).toBeVisible();
  await page.reload();
  await page.locator('.sidebar').getByRole('button',{name:'Project Docs',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(`Persisted doc ${suffix} General`)}).click();
  await expect(page.getByLabel('Document content')).toHaveValue('## Verified notes\n- Browser → API → D1 persisted');
  await page.getByRole('button', { name:'Collaborator', exact:true }).click();
  const collaborator = page.getByRole('dialog', { name:'Collaborator', exact:true });
  const viewerEmail = `viewer-ui-${suffix}@example.test`;
  await collaborator.getByLabel('Email', { exact:true }).fill(viewerEmail);
  await collaborator.getByRole('button', { name:'Invite', exact:true }).click();
  const linkField = collaborator.getByLabel('Invitation link (expires in 7 days)');
  await expect(linkField).toBeVisible();
  const link = await linkField.inputValue();
  const viewerContext = await browser.newContext();
  try {
    const viewer = await viewerContext.newPage();
    viewer.on('pageerror', error => errors.push(error.message));
    await viewer.goto(link);
    await register(viewer, `QA Viewer ${suffix}`, viewerEmail);
    await expect(viewer.getByRole('heading', { name:'Overview', exact:true })).toBeVisible();
    await expect(viewer.getByText(/View-only access/)).toBeVisible();
    await viewer.locator('.sidebar').getByRole('button', { name:'All Reviews', exact:true }).click();
    await expect(viewer.getByRole('button', { name:'Submit Review', exact:true })).toBeDisabled();
    await viewer.locator('.reviews-page').getByText(`Persisted task ${suffix}`, { exact:true }).click();
    const viewerDrawer = viewer.getByRole('dialog', { name:'Task details' });
    await expect(viewerDrawer.getByLabel('Estimate (hours)', { exact:true })).toBeDisabled();
    await expect(viewerDrawer.getByLabel('Estimate (hours)', { exact:true })).toHaveValue('3.5');
    await viewer.screenshot({ path:'test-results/ui-audit/real-worker-viewer.png' });
    await viewerDrawer.getByRole('button',{name:'Close task details'}).click();
    await viewer.locator('.sidebar').getByRole('button',{name:'Project Docs',exact:true}).click();
    await viewer.getByRole('button',{name:new RegExp(`Persisted doc ${suffix} General`)}).click();
    await expect(viewer.getByRole('heading',{name:'Verified notes',exact:true})).toBeVisible();
    await expect(viewer.getByRole('button',{name:'Save document'})).toBeDisabled();
  } finally { await viewerContext.close(); }
  await page.screenshot({ path:'test-results/ui-audit/real-worker-invite.png' });
  expect(errors).toEqual([]);
  if(staging){
    const deletion=await page.evaluate(async title=>{
      const data=await(await fetch('/api/bootstrap')).json();
      const project=data.projects.find(item=>item.name===title);
      if(!project)throw new Error('Disposable staging project not found.');
      return (await fetch('/api/projects/'+project.id,{method:'DELETE'})).status;
    },`Browser QA ${suffix}`);
    expect(deletion).toBe(200);
  }
});
