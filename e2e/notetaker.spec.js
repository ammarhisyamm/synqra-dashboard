import { test,expect } from '@playwright/test';

test('meeting workspace persists notes, captures through fixture, and shares a public snapshot through real D1',async({page,browser})=>{
  test.skip(process.env.E2E_REAL_WORKER!=='1' || !process.env.NOTETAKER_FIXTURE_URL,'Requires disposable local Worker and Vexa fixture. Does not join a real meeting.');
  test.setTimeout(60000);
  const suffix=crypto.randomUUID().slice(0,8);const errors=[];page.on('pageerror',error=>errors.push(error.message));
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
  await page.getByRole('button',{name:'Online meeting',exact:true}).click();
  const online=page.getByRole('dialog',{name:'Online meeting',exact:true});
  await online.getByLabel('Meeting title',{exact:true}).fill('Saved online meeting '+suffix);
  await online.getByRole('button',{name:'Save meeting',exact:true}).click();
  await expect(online).toHaveCount(0);
  await page.getByRole('button',{name:'Send notetaker',exact:true}).click();
  const join=page.getByRole('dialog',{name:'Send meeting notetaker'});
  await join.getByLabel('Google Meet or Zoom link').fill('https://zoom.us/j/'+String(Date.now()).slice(-10)+'?pwd=fixture-passcode');
  await expect(join.getByRole('button',{name:'Send bot',exact:true})).toBeDisabled();
  await join.getByRole('checkbox').check();
  await join.getByRole('button',{name:'Send bot',exact:true}).click();
  await expect(join).toHaveCount(0);await expect(page.getByText('Recording & transcribing',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sync now'}).click();
  await page.getByRole('tab',{name:'Transcript',exact:true}).click();
  await expect(page.getByText('Kita perlu memperbaiki alur onboarding minggu ini.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Stop bot',exact:true}).click();
  await page.getByRole('dialog',{name:'Stop meeting bot?'}).getByRole('button',{name:'Stop bot',exact:true}).click();
  await page.getByRole('button',{name:'Sync now'}).click();
  await expect(page.getByText('Capture completed',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Recordings',exact:true}).click();
  await expect(page.locator('audio')).toHaveCount(1);
  await page.getByRole('tab',{name:'Summary',exact:true}).click();
  await page.getByLabel('Meeting summary').fill('Summary reviewed by QA '+suffix);
  await expect(page.getByRole('button',{name:'Generate summary',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Save summary',exact:true}).click();
  await page.getByRole('button',{name:'Edit notes',exact:true}).click();
  await page.getByLabel('Meeting notes', {exact:true}).fill('Saved private meeting notes '+suffix);
  await page.getByRole('button',{name:'Save notes',exact:true}).click();
  await page.reload();await page.locator('.sidebar').getByRole('button',{name:'Meetings',exact:true}).click();
  await expect(page.getByLabel('Meeting summary')).toHaveValue('Summary reviewed by QA '+suffix);
  await page.getByRole('button',{name:'Share',exact:true}).click();
  const share=page.getByRole('dialog',{name:'Share meeting',exact:true});
  await expect(share.getByRole('button',{name:'Create share link',exact:true})).toBeDisabled();
  await share.getByRole('checkbox',{name:/I understand/}).check();
  await share.getByRole('button',{name:'Create share link',exact:true}).click();
  const link=await share.getByLabel('Share link',{exact:true}).inputValue();
  const guestContext=await browser.newContext();
  try {
    const guest=await guestContext.newPage();guest.on('pageerror',error=>errors.push(error.message));
    await guest.goto(link);await expect(guest.getByRole('heading',{name:'Saved online meeting '+suffix})).toBeVisible();
    await expect(guest.getByText('Summary reviewed by QA '+suffix,{exact:true})).toBeVisible();
    await expect(guest.getByRole('heading',{name:'Transcript',exact:true})).toHaveCount(0);
    await expect(guest.locator('audio,video')).toHaveCount(0);
    await guest.screenshot({path:(process.env.NOTETAKER_EVIDENCE_DIR || 'test-results/ui-audit')+'/meeting-shared.png',fullPage:true});
    await share.getByRole('button',{name:'Revoke link',exact:true}).click();
    await page.getByRole('dialog',{name:'Revoke meeting link?'}).getByRole('button',{name:'Revoke link',exact:true}).click();
    await guest.reload();await expect(guest.getByRole('heading',{name:'Meeting unavailable'})).toBeVisible();
  }finally{await guestContext.close();}
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

for(const width of [1440,768,375])test(`meeting controls remain consistent at ${width}px without an engine`,async({page})=>{
  test.skip(process.env.E2E_REAL_WORKER==='1','Mock UI matrix runs separately from real Worker tests.');
  await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const project={id:'meeting-project',name:'Meeting QA',role:'editor'};const meeting={id:'meeting-fixture',title:'Responsive meeting with a sufficiently long descriptive title',date:'2026-10-08',projectId:project.id,notes:'Private office notes',attendees:[]};
  let failed=true;
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/api/auth/me')return send({user:{id:'qa',name:'QA',email:'qa@example.test',role:'member'}});
    if(path==='/api/bootstrap')return send({project,projects:[project],reviews:[],meetings:[meeting],spaces:[],metadata:[],sprints:[],workflowStatuses:[],workload:[],reportByStatus:[],unreadNotifications:0});
    if(path==='/api/team')return send({team:[]});if(path==='/api/notifications')return send({notifications:[]});
    if(path.endsWith('/capture'))return send({capture:null,configured:false,localAiConfigured:false,summary:'',shares:[]});
    if(path.endsWith('/summary')){if(failed){failed=false;return send({error:'QA summary save failed'},503);}return send({capture:null,configured:false,summary:route.request().postDataJSON().summary,shares:[]});}
    return send({ok:true,members:[],preferences:{}});
  });
  await page.goto('/');await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  if(width<=650)await page.getByRole('button',{name:'Toggle menu'}).click();
  await page.locator('.sidebar').getByRole('button',{name:'Meetings',exact:true}).click();
  await expect(page.getByText('Notetaker server not connected.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Send notetaker',exact:true})).toBeDisabled();
  await page.getByLabel('Meeting summary').fill('An unsaved draft that must survive a failed save.');
  await page.getByRole('button',{name:'Save summary',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('QA summary save failed');
  await expect(page.getByLabel('Meeting summary')).toHaveValue('An unsaved draft that must survive a failed save.');
  await page.getByRole('button',{name:'Save summary',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save summary',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Share',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Share meeting',exact:true});
  await expect(modal).toBeVisible();await modal.getByRole('combobox',{name:'Link expires after'}).click();
  await expect(page.getByRole('option',{name:'30 days',exact:true})).toBeVisible();await page.getByRole('option',{name:'30 days',exact:true}).click();
  const bounds=await modal.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width+1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
  await page.screenshot({path:`test-results/ui-audit/meeting-share-${width}-${test.info().project.name}.png`});
});
