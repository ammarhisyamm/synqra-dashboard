import { test, expect } from '@playwright/test';

test('core meeting notes remain usable while the meeting assistant is hidden',async({page})=>{
  test.skip(process.env.E2E_REAL_WORKER!=='1','Requires a disposable local Worker/D1.');
  test.setTimeout(60000);
  const suffix=crypto.randomUUID().slice(0,8);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let captureRequests=0;
  page.on('request',request=>{if(request.url().includes('/capture'))captureRequests++;});
  await page.goto('/');
  await page.getByRole('button',{name:'New to Synqra? Create an account'}).click();
  await page.getByLabel('Name',{exact:true}).fill('Meeting QA '+suffix);
  await page.getByLabel('Email',{exact:true}).fill('meeting-ui-'+suffix+'@example.test');
  await page.getByLabel('Password',{exact:true}).fill(crypto.randomUUID()+'!Qa');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Create your first project'})).toBeVisible();
  await page.getByLabel('Project name').fill('Meeting QA '+suffix);
  await page.getByRole('button',{name:'Create project',exact:true}).click();
  await page.getByRole('button',{name:'Finish setup'}).click();
  await page.locator('.sidebar').getByRole('button',{name:'Meetings',exact:true}).click();
  await expect(page.getByRole('button',{name:'Online meeting',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'New meeting',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'New meeting',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Meeting title',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Meeting notes',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Generate AI',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Notetaker & meeting workspace',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Meetings',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'New meeting',exact:true})).toBeVisible();
  expect(captureRequests).toBe(0);
  for(const width of [1440,768,375]) {
    await page.setViewportSize({width,height:900});
    if(width<=650 && await page.locator('.sidebar.open').count())await page.getByRole('button',{name:'Toggle menu'}).click();
    if(width<=650) {
      await expect(page.locator('.sidebar.open')).toHaveCount(0);
      // Resizing starts the off-canvas transition; verify its end state before capturing evidence.
      await expect.poll(()=>page.locator('.sidebar').evaluate(element=>element.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
    await page.screenshot({path:`${process.env.NOTETAKER_EVIDENCE_DIR || 'test-results/ui-audit'}/meeting-${width}.png`,fullPage:true,animations:'disabled'});
  }
  expect(errors).toEqual([]);
});

for(const width of [1440,768,375])test(`paused assistant stays hidden and core meetings remain usable at ${width}px`,async({page})=>{
  test.skip(process.env.E2E_REAL_WORKER==='1','Mock UI matrix runs separately from real Worker tests.');
  await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const project={id:'meeting-project',name:'Meeting QA',role:'editor'};const meeting={id:'meeting-fixture',title:'Responsive meeting with a sufficiently long descriptive title',date:'2026-10-08',projectId:project.id,notes:'Private office notes',attendees:[]};
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/api/auth/me')return send({user:{id:'qa',name:'QA',email:'qa@example.test',role:'member'}});
    if(path==='/api/bootstrap')return send({project,projects:[project],reviews:[],meetings:[meeting],spaces:[],metadata:[],sprints:[],workflowStatuses:[],workload:[],reportByStatus:[],unreadNotifications:0});
    if(path==='/api/team')return send({team:[]});if(path==='/api/notifications')return send({notifications:[]});
    return send({ok:true,members:[],preferences:{}});
  });
  await page.goto('/');await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  if(width<=650)await page.getByRole('button',{name:'Toggle menu'}).click();
  await page.locator('.sidebar').getByRole('button',{name:'Meetings',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Notetaker & meeting workspace',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Online meeting',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Send notetaker',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:meeting.title,exact:true})).toBeVisible();
  await expect(page.getByText('Private office notes',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Action items',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
  await page.screenshot({path:`test-results/ui-audit/meeting-share-${width}-${test.info().project.name}.png`});
});
