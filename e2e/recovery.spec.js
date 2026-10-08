import { test,expect } from '@playwright/test';
test('reset link preserves input on failure, clears the token after success and does not sign in automatically',async({page})=>{
  let tries=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(!path.startsWith('/api/'))return route.continue();
    if(path==='/api/auth/password-reset'){
      tries++;expect(route.request().postDataJSON().token).toBe('a'.repeat(64));
      return route.fulfill({status:tries===1?403:200,contentType:'application/json',body:JSON.stringify(tries===1?{error:'Enter a valid authenticator or recovery code.'}:{ok:true})});
    }
    return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Sign in required.'})});
  });
  await page.goto('/#reset='+'a'.repeat(64));
  await expect(page.getByRole('heading',{name:'Reset your password'})).toBeVisible();
  await page.getByLabel('Password',{exact:true}).fill('Recovered-office-password!');
  await page.getByRole('button',{name:'Reset password',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Enter a valid');
  await expect(page.getByLabel('Password',{exact:true})).toHaveValue('Recovered-office-password!');
  await page.getByLabel('Authenticator or recovery code (if enabled)').fill('abcdef0123456789');
  await page.getByRole('button',{name:'Reset password',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
  expect(errors).toEqual([]);
});
