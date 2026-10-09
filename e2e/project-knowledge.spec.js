import { test, expect } from '@playwright/test';

async function fixture(page,{viewer=false,conflict=false}={}) {
  const user={id:'knowledge-user',name:'Knowledge QA',role:'member',email:'knowledge@example.test'};
  const project={id:'knowledge-project',name:'Knowledge project',role:viewer ? 'viewer':'editor',accessMode:'invite'};
  const second={id:'other-project',name:'Second project',role:'editor',accessMode:'invite'};
  const data={project,projects:[project,second],reviews:[{id:'mine-second',key:'QA-2',title:'Secondary assignment in second project',projectId:second.id,assignees:['Someone else',user.name],assignee:'Someone else',stage:'In Progress',status:'In Progress',estimateHours:2,priority:'Minor'},{id:'archived-mine',title:'Archived task',projectId:project.id,assignee:user.name,archived:1}],meetings:[],sprints:[],metadata:[],spaces:[],workflowStatuses:[],unreadNotifications:0};
  const documents=[]; const errors=[]; const writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const request=route.request(); const path=new URL(request.url()).pathname; const method=request.method();
    if (!path.startsWith('/api/')) return route.continue();
    const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/api/auth/me')return send({user});
    if(path==='/api/bootstrap')return send(data);
    if(path==='/api/team')return send({team:[user]});
    if(path==='/api/notifications')return send({notifications:[]});
    if(path==='/api/telemetry')return send({ok:true},202);
    if(path==='/api/documents' && method==='GET')return send({documents});
    const body=method==='GET' ? null : request.postDataJSON();
    if(path==='/api/documents' && method==='POST') { const saved={...body,version:1,archived:0,epicId:null,sprintId:null}; documents.push(saved); writes.push(body); return send(saved,201); }
    if(path.startsWith('/api/documents/') && method==='PATCH') {
      if(conflict && !body.archived)return send({error:'This document changed in another session. Your edits are kept. Reload the latest version before saving.'},409);
      const doc=documents.find(doc=>path.endsWith(doc.id)); Object.assign(doc,body,{version:doc.version+1}); writes.push(body); return send(doc);
    }
    if(path==='/api/meetings' && method==='POST') { const saved={...body,id:body.id || 'new-meeting'}; data.meetings.push(saved); writes.push(body); return send(saved,201); }
    throw new Error(`Unmocked knowledge endpoint: ${method} ${path}`);
  });
  await page.goto('/'); await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  return {data,documents,writes,errors};
}
async function navigate(page,name) {
  if(page.viewportSize().width<=650 && !await page.locator('.sidebar.open').count())await page.getByRole('button',{name:'Toggle menu'}).click();
  await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
}
async function noOverflow(page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
}
for(const width of [1440,768,375]) test(`meeting preview and project docs stay consistent at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000}); const state=await fixture(page);
  await navigate(page,'Meetings'); await page.getByRole('button',{name:'New meeting',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Choose a meeting template'})).toBeVisible();
  await page.getByLabel('Search templates').fill('candidate');
  await page.getByRole('button',{name:/Candidate interview People/}).click();
  await expect(page.getByRole('heading',{name:'Competency evidence'})).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:`test-results/knowledge/template-${width}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Use Candidate interview',exact:true}).click();
  await expect(page.getByLabel('Meeting notes')).toHaveValue(/## Role & interview plan/);
  await expect(page.getByRole('button',{name:'Generate AI',exact:true})).toBeDisabled();
  await page.getByLabel('Meeting notes').fill('Action: write a test after the meeting.');
  await page.getByRole('button',{name:'Change template'}).click();
  await expect(page.getByRole('button',{name:'Use Candidate interview',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByLabel('Meeting notes')).toHaveValue('Action: write a test after the meeting.');
  await page.getByRole('button',{name:'Save meeting',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Meeting saved',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View meetings',exact:true}).click();
  expect(state.writes[0].templateId).toBe('candidate-interview');
  await navigate(page,'Project Docs');
  await page.getByRole('button',{name:'New document'}).click();
  const dialog=page.getByRole('dialog',{name:'New document'});
  await expect(dialog.getByRole('button',{name:'Create document',exact:true})).toBeDisabled();
  await dialog.getByLabel('Document title').fill('Product notes');
  await dialog.getByRole('button',{name:'Create document',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('Document content').fill('## Decisions\n- Ship the tested flow\n<script>window.evil=true</script>');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Decisions',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.evil)).toBeUndefined();
  await page.getByRole('button',{name:'Save document',exact:true}).click();
  await expect(page.getByText('Document saved.',{exact:true})).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:`test-results/knowledge/docs-${width}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Archive document',exact:true}).click();
  await page.getByRole('dialog',{name:'Archive document?'}).getByRole('button',{name:'Archive document',exact:true}).click();
  await expect(page.getByText('Document archived.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Restore document',exact:true}).click();
  await expect(page.getByText('Document restored.',{exact:true})).toBeVisible();
  await navigate(page,'My Work'); await expect(page.getByText('Secondary assignment in second project',{exact:true})).toBeVisible();
  await expect(page.getByText('Archived task',{exact:true})).toHaveCount(0);
  await noOverflow(page); expect(state.errors).toEqual([]);
});
test('document conflict keeps edits, restores the device draft, and viewer cannot edit',async({page})=>{
  const state=await fixture(page,{conflict:true});
  state.documents.push({id:'conflict-doc',projectId:'knowledge-project',title:'Existing doc',type:'general',content:'Original',version:1,archived:0});
  await navigate(page,'Project Docs'); await page.getByRole('button',{name:/Existing doc General/}).click();
  await page.getByLabel('Document content').fill('Unsaved conflict draft');
  await page.getByRole('button',{name:'Save document',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('changed in another session');
  await expect(page.getByLabel('Document content')).toHaveValue('Unsaved conflict draft');
  await navigate(page,'Meetings'); await navigate(page,'Project Docs');
  await expect(page.getByLabel('Document content')).toHaveValue('Unsaved conflict draft');
  await page.getByRole('button',{name:'Reload latest'}).click();
  await page.getByRole('dialog',{name:'Discard unsaved document edits?'}).getByRole('button',{name:'Discard edits'}).click();
  await page.getByRole('button',{name:/Existing doc General/}).click();
  await expect(page.getByLabel('Document content')).toHaveValue('Original');
  expect(state.errors).toEqual([]);
});
test('viewer documents use read-only controls',async({page})=>{
  const state=await fixture(page,{viewer:true});
  state.documents.push({id:'viewer-doc',title:'Read-only doc',type:'general',content:'## Read only',version:1,archived:0});
  await navigate(page,'Project Docs');
  await expect(page.getByRole('button',{name:'New document'})).toBeDisabled();
  await page.getByRole('button',{name:/Read-only doc General/}).click();
  await expect(page.getByLabel('Document title')).toBeDisabled();
  await expect(page.getByRole('button',{name:'Save document'})).toBeDisabled();
  await expect(page.getByLabel('Document content')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Read only',exact:true})).toBeVisible();
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});
