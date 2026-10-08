import { test,expect } from '@playwright/test';

for(const width of [375,1280])test(`office settings stay usable at ${width}px, preferences and feedback recover from errors`,async({ page })=>{
  await page.setViewportSize({ width,height:900 });
  const user={ id:'qa-office',name:'Office QA',email:'office@example.test',role:'super_admin',username:'office' };
  const project={ id:'office-project',name:'Office project',createdBy:user.id,role:'editor',accessMode:'invite' };
  const data={ project,projects:[project],reviews:[],meetings:[],spaces:[],metadata:[],sprints:[],workflowStatuses:[],unreadNotifications:0 };
  let preferences={ activity:1,reminders:1,mentions:1 };let submissions=0;
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const policyErrors=[];page.on('console',message=>{if(/Content Security Policy|style-src directive/i.test(message.text()))policyErrors.push(message.text());});
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;const method=route.request().method();
    if(!path.startsWith('/api/'))return route.continue();
    const send=(body,status=200)=>route.fulfill({ status,contentType:'application/json',body:JSON.stringify(body) });
    if(path==='/api/auth/me')return send({ user });
    if(path==='/api/bootstrap')return send(data);
    if(path==='/api/team')return send({ team:[user] });
    if(path==='/api/notifications')return send({ notifications:[] });
    if(path==='/api/account/security')return send({ activeSessions:2,mfaEnabled:false,mfaAvailable:false });
    if(path==='/api/account/preferences'){
      if(method==='PATCH')preferences=route.request().postDataJSON();
      return send({ preferences });
    }
    if(path==='/api/admin/operations')return send({ release:'qa-test',environment:'test',cleanup:{ pending:0 },adoption:{ activeUsers:2 },errors:[],feedback:[] });
    if(path==='/api/feedback'){submissions++;return send(submissions===1?{ error:'Temporary feedback failure' }:{ ok:true },submissions===1?503:201);}
    return send({ ok:true });
  });
  await page.goto('/');
  if(width<720)await page.getByRole('button',{ name:'Toggle menu',exact:true }).click();
  await page.locator('.sidebar').getByRole('button',{ name:'Settings',exact:true }).click();
  await expect(page.getByRole('heading',{ name:'Account security' })).toBeVisible();
  await expect(page.getByRole('button',{ name:'Set up MFA' })).toBeDisabled();
  const activity=page.getByText('Project activity and task changes',{ exact:true }).locator('..').getByRole('checkbox');
  await activity.click();await expect(activity).toHaveAttribute('data-state','unchecked');
  await page.getByRole('button',{ name:'Save preferences' }).click();
  await expect(page.getByText('Notification preferences saved.',{ exact:true })).toBeVisible();
  expect(preferences.activity).toBe(false);
  await page.getByLabel('Feedback',{ exact:true }).fill('The toolbar overlaps on a narrow screen.');
  await page.getByRole('button',{ name:'Send feedback' }).click();
  await expect(page.getByText('Temporary feedback failure',{ exact:true })).toBeVisible();
  await expect(page.getByLabel('Feedback',{ exact:true })).toHaveValue('The toolbar overlaps on a narrow screen.');
  await page.getByRole('button',{ name:'Send feedback' }).click();
  await expect(page.getByText('Feedback saved for your workspace administrators.')).toBeVisible();
  expect(submissions).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  expect(errors).toEqual([]);
  expect(policyErrors).toEqual([]);
  await page.screenshot({ path:test.info().outputPath(`office-settings-${width}.png`),fullPage:true });
});
