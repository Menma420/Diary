import {test,expect,email,password,resetLimits,fixtureAdmin} from './auth-fixture';
import type {Page,APIRequestContext} from '@playwright/test';
import {makeSignature} from 'better-auth/crypto';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
const themes=['sakura-pink','dreamy-sky','lavender-dreams','vintage-journal'];
const origin='http://127.0.0.1:3100';
const read=async(request:APIRequestContext)=>(await(await request.get('/api/preferences')).json()).preferences;
const patch=(request:APIRequestContext,theme:string,baseVersion=0,timezone='Asia/Kolkata',mutationId=crypto.randomUUID())=>request.patch('/api/preferences',{headers:{origin},data:{theme,timezone,baseVersion,mutationId}});
async function open(page:Page){await page.goto('/diary/01/11/2026');await expect(page.locator('#diary-writing')).toBeEditable();}
async function settingsSaved(page:Page){await expect(page.getByRole('status',{name:'Preference save status'})).toHaveText('Settings saved');}
async function retrySettings(page:Page){await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Retry settings save',exact:true}).click();await settingsSaved(page);await page.getByRole('button',{name:'Close settings'}).click();}
async function records(page:Page){return page.evaluate(()=>new Promise<unknown[]>((resolve,reject)=>{const request=indexedDB.open('dear-diary-recovery',1);request.onerror=()=>reject(Error('Fixture recovery read failed'));request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readonly'),all=tx.objectStore('drafts').getAll();all.onsuccess=()=>resolve(all.result);tx.oncomplete=()=>db.close();};}));}
test('defaults, four themes, authenticated refresh and new login retain server preferences before first paint',async({page,context},info)=>{
 await open(page);expect(await read(context.request)).toMatchObject({theme:'sakura-pink',timezone:'Asia/Kolkata',version:0});
 await mkdir('artifacts/phase-7',{recursive:true});
 for(const theme of themes){
  await page.getByRole('combobox',{name:'Theme preview'}).selectOption(theme);
  if(theme!=='sakura-pink')await settingsSaved(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  const response=await context.request.get('/diary/01/11/2026');expect(await response.text()).toMatch(new RegExp(`<html[^>]*data-theme="${theme}"`));
  await page.reload();await expect(page.locator('#diary-writing')).toBeEditable();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await page.screenshot({path:`artifacts/phase-7/theme-${info.project.name}-${theme}.png`,fullPage:true});
 }
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Save and sign out'}).click();await expect(page).toHaveURL(/login$/);
 await resetLimits();await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('#diary-writing')).toBeEditable();await expect(page.locator('html')).toHaveAttribute('data-theme','vintage-journal');
});
test('rapid theme selection during a delayed acknowledgement retains latest selection and serializes requests',async({page,context})=>{
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);const bodies:unknown[]=[];
 await page.route('**/api/preferences',async route=>{if(route.request().method()==='PATCH'){bodies.push(route.request().postDataJSON());if(bodies.length===1){const response=await route.fetch();started();await gate;await route.fulfill({response});return;}}await route.continue();});
 await open(page);const theme=page.getByRole('combobox',{name:'Theme preview'});await theme.selectOption('dreamy-sky');await ready;await theme.selectOption('lavender-dreams');expect(bodies).toHaveLength(1);await expect(page.locator('html')).toHaveAttribute('data-theme','lavender-dreams');release();await settingsSaved(page);
 expect(bodies).toHaveLength(2);expect(await read(context.request)).toMatchObject({theme:'lavender-dreams',version:2});
});
test('lost preference commit response retries exact mutation identity and reports current server confirmation',async({page,context})=>{
 const bodies:string[]=[];await page.route('**/api/preferences',async route=>{if(route.request().method()==='PATCH'){bodies.push(route.request().postData()!);if(bodies.length===1){await route.fetch();await route.abort();return;}}await route.continue();});
 await open(page);await page.getByRole('combobox',{name:'Theme preview'}).selectOption('dreamy-sky');await expect(page.getByRole('status',{name:'Preference save status'})).toHaveText('Settings save failed');
 await page.getByRole('combobox',{name:'Theme preview'}).selectOption('vintage-journal');await expect(page.getByRole('status',{name:'Preference save status'})).toHaveText('Settings save failed');
 await retrySettings(page);expect(bodies[0]).toBe(bodies[1]);expect(bodies).toHaveLength(3);expect(await read(context.request)).toMatchObject({theme:'vintage-journal',version:2});
});
test('two authenticated sessions conflict without silently replacing the latest local choice',async({page,context,browser})=>{
 await open(page);const other=await browser.newContext();try{
  await resetLimits();expect((await other.request.post('/api/auth/sign-in/email',{headers:{origin},data:{email,password}})).status()).toBe(200);
  const second=await other.newPage();await open(second);await second.getByRole('combobox',{name:'Theme preview'}).selectOption('dreamy-sky');await settingsSaved(second);
  await page.getByRole('combobox',{name:'Theme preview'}).selectOption('lavender-dreams');await expect(page.getByRole('status',{name:'Preference save status'})).toContainText('Settings conflict');await expect(page.locator('html')).toHaveAttribute('data-theme','lavender-dreams');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Keep my settings'}).click();await settingsSaved(page);expect(await read(context.request)).toMatchObject({theme:'lavender-dreams',version:2});
  await second.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(second.locator('html')).toHaveAttribute('data-theme','lavender-dreams');
 }finally{await other.close();}
});
test('preference failure and reconciliation preserve exact unresolved entry recovery, caret, scroll and save count',async({page,context})=>{
 let entryWrites=0;await page.route('**/api/entries/**',route=>{if(route.request().method()==='PUT'){entryWrites++;return route.fulfill({status:503,json:{error:'Synthetic outage'}});}return route.continue();});
 await page.route('**/api/preferences',route=>route.request().method()==='PATCH'?route.fulfill({status:503,json:{error:'Synthetic unavailable'}}):route.continue());
 await open(page);const editor=page.locator('#diary-writing');await editor.fill('Synthetic unresolved writing\n'.repeat(50));await expect(page.locator('#preview-notice')).toHaveText('Save failed');await expect.poll(async()=>(await records(page)).length).toBe(1);const before=await records(page),writes=entryWrites;
 await editor.evaluate((node:HTMLTextAreaElement)=>{node.dataset.original='yes';node.focus();node.setSelectionRange(3,12,'backward');window.scrollTo(0,400);});const y=await page.evaluate(()=>scrollY);
 await page.getByRole('combobox',{name:'Theme preview'}).dispatchEvent('pointerdown');await page.getByRole('combobox',{name:'Theme preview'}).selectOption('dreamy-sky');
 await expect(page.getByRole('status',{name:'Preference save status'})).toHaveText('Settings save failed');await expect(editor).toHaveAttribute('data-original','yes');expect(await records(page)).toEqual(before);expect(entryWrites).toBe(writes);await expect(page.locator('#preview-notice')).toHaveText('Save failed');
 expect(await editor.evaluate((node:HTMLTextAreaElement)=>[node.selectionStart,node.selectionEnd,node.selectionDirection])).toEqual([3,12,'backward']);expect(await page.evaluate(()=>scrollY)).toBe(y);
 await page.unroute('**/api/preferences');await retrySettings(page);expect(await records(page)).toEqual(before);expect(entryWrites).toBe(writes);expect((await read(context.request)).theme).toBe('dreamy-sky');
});
test('theme changes during entry save and composition do not remount the editor or alter mutation snapshots',async({page,context})=>{
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);let body:string|undefined,writes=0;
 await page.route('**/api/entries/**',async route=>{if(route.request().method()==='PUT'){writes++;body=route.request().postData()!;const response=await route.fetch();started();await gate;await route.fulfill({response});}else await route.continue();});
 await open(page);const editor=page.locator('#diary-writing');await editor.fill('Writing during save');await ready;await editor.evaluate((node:HTMLTextAreaElement)=>{node.dataset.original='yes';node.setSelectionRange(2,6,'backward');});const before=await records(page);
 await editor.dispatchEvent('compositionstart');await page.getByRole('combobox',{name:'Theme preview'}).selectOption('vintage-journal');await settingsSaved(page);expect(await records(page)).toEqual(before);expect(writes).toBe(1);expect(JSON.parse(body!).content).toBe('Writing during save');
 await expect(editor).toHaveAttribute('data-original','yes');await expect(editor).toHaveValue('Writing during save');expect(await editor.evaluate((node:HTMLTextAreaElement)=>[node.selectionStart,node.selectionEnd,node.selectionDirection])).toEqual([2,6,'backward']);
 await editor.dispatchEvent('compositionend');release();await expect(page.locator('#preview-notice')).toHaveText('Saved');expect((await(await context.request.get('/api/entries/01/11/2026')).json()).entry.version).toBe(1);
});
test('timezone applies only to future Today calculations and survives reload',async({page,context})=>{
 await open(page);await page.clock.install({time:new Date('2026-11-01T12:30:00Z')});
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('IANA timezone',{exact:true}).fill('Pacific/Kiritimati');await page.getByRole('button',{name:'Apply timezone'}).click();await settingsSaved(page);await expect(page).toHaveURL(/01\/11\/2026$/);
 await page.getByRole('button',{name:'Close settings'}).click();await page.getByRole('button',{name:'Today',exact:true}).click();await expect(page).toHaveURL(/02\/11\/2026$/);
 expect((await read(context.request)).timezone).toBe('Pacific/Kiritimati');await page.reload();await expect(page.getByRole('button',{name:'Today',exact:true})).toHaveAttribute('title','Today in Pacific/Kiritimati');
});
test('settings keyboard, radio previews, validation, focus restoration and all-theme accessibility',async({page},info)=>{
 await open(page);const trigger=page.getByRole('button',{name:'Settings',exact:true});await trigger.focus();await trigger.press('Enter');const dialog=page.getByRole('dialog',{name:'Appearance and timezone'});
 for(const name of ['Sakura Pink','Dreamy Sky','Lavender Dreams','Vintage Journal']){
  await dialog.getByRole('radio',{name,exact:true}).check();await expect(dialog.getByRole('radio',{name,exact:true})).toBeChecked();expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 }
 await page.screenshot({path:`artifacts/phase-7/settings-${info.project.name}.png`,fullPage:true});
 await page.getByLabel('IANA timezone',{exact:true}).fill('Not/AZone');await page.getByRole('button',{name:'Apply timezone'}).click();await expect(dialog.getByRole('alert')).toContainText('valid IANA');
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
});
test('every preferences operation authorizes independently, validates origin/input and hides internal IDs',async({context,request})=>{
 expect((await request.get('/api/preferences')).status()).toBe(401);expect((await request.patch('/api/preferences',{headers:{origin},data:{}})).status()).toBe(401);
 const response=await context.request.get('/api/preferences');expect(response.headers()['cache-control']).toContain('no-store');expect(await response.text()).not.toContain('12345678-1234-4234-8234-123456789abc');
 expect((await context.request.patch('/api/preferences',{headers:{origin:'https://evil.example'},data:{}})).status()).toBe(403);
 expect((await context.request.patch('/api/preferences',{headers:{origin},data:{theme:'dreamy-sky',timezone:'UTC',baseVersion:0,mutationId:crypto.randomUUID(),ownerId:crypto.randomUUID()}})).status()).toBe(400);
 expect((await patch(context.request,'unknown')).status()).toBe(400);expect((await patch(context.request,'dreamy-sky',0,'Not/AZone')).status()).toBe(400);
 const token=crypto.randomUUID(),pool=await fixtureAdmin();try{await pool.query('INSERT INTO auth_session(id,token,"userId","createdAt","updatedAt","expiresAt") VALUES($1,$1,\'fixture-other\',now(),now(),now()+interval \'1 hour\')',[token]);}finally{await pool.end();}
 const signature=await makeSignature(token,process.env.BETTER_AUTH_SECRET!);await context.addCookies([{name:'__Secure-dear-diary.session_token',value:encodeURIComponent(`${token}.${signature}`),domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
 expect((await context.request.get('/api/preferences')).status()).toBe(403);expect((await patch(context.request,'dreamy-sky')).status()).toBe(403);
});
test('session expiry during preference save preserves writing and resumes only for the same owner',async({page,context})=>{
 let release!:()=>void,committed!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>committed=r);const bodies:string[]=[];
 await page.route('**/api/preferences',async route=>{if(route.request().method()==='PATCH'){bodies.push(route.request().postData()!);if(bodies.length===1){const response=await route.fetch();committed();await gate;await route.fulfill({response});return;}}await route.continue();});
 await open(page);await page.locator('#diary-writing').fill('Retained through preference expiry');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Dreamy Sky',exact:true}).check();await ready;
 const pool=await fixtureAdmin();try{await pool.query('DELETE FROM auth_session');}finally{await pool.end();}release();
 await expect(page.getByRole('heading',{name:'Sign in to continue writing'})).toBeVisible();
 await resetLimits();await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('#diary-writing')).toHaveValue('Retained through preference expiry');await settingsSaved(page);expect(await read(context.request)).toMatchObject({theme:'dreamy-sky',version:1});expect(bodies).toHaveLength(2);expect(bodies[1]).toBe(bodies[0]);
});

test('closing settings after a writing interaction restores the original node, selection direction and scroll without an entry write',async({page})=>{
 let writes=0;page.on('request',request=>{if(request.url().includes('/api/entries/')&&request.method()==='PUT')writes++;});
 await open(page);const editor=page.locator('#diary-writing');await editor.fill('Synthetic scroll-preserving writing\n'.repeat(50));await expect(page.locator('#preview-notice')).toHaveText('Saved');const before=await records(page),count=writes;
 await editor.evaluate((node:HTMLTextAreaElement)=>{node.dataset.original='yes';node.focus();node.setSelectionRange(4,12,'backward');window.scrollTo(0,400);});
 expect(await editor.evaluate((node:HTMLTextAreaElement)=>[node.selectionStart,node.selectionEnd,node.selectionDirection])).toEqual([4,12,'backward']);
 const y=await page.evaluate(()=>scrollY),trigger=page.getByRole('button',{name:'Settings',exact:true});await trigger.dispatchEvent('pointerdown');
 expect(await editor.evaluate((node:HTMLTextAreaElement)=>[node.selectionStart,node.selectionEnd,node.selectionDirection])).toEqual([4,12,'backward']);await trigger.evaluate((node:HTMLButtonElement)=>node.click());
 await page.getByRole('radio',{name:'Dreamy Sky',exact:true}).check();await settingsSaved(page);await page.getByRole('button',{name:'Close settings'}).click();
 await expect(editor).toBeFocused();await expect(editor).toHaveAttribute('data-original','yes');expect(await editor.evaluate((node:HTMLTextAreaElement)=>[node.selectionStart,node.selectionEnd,node.selectionDirection])).toEqual([4,12,'backward']);expect(await page.evaluate(()=>scrollY)).toBe(y);expect(await records(page)).toEqual(before);expect(writes).toBe(count);await page.waitForTimeout(200);await expect(editor).toBeFocused();expect(await editor.evaluate((node:HTMLTextAreaElement)=>[node.selectionStart,node.selectionEnd,node.selectionDirection])).toEqual([4,12,'backward']);
});

test('legacy unsupported stored theme falls back before paint and offers a version-checked repair',async({page,context})=>{
 const pool=await fixtureAdmin();try{
  await patch(context.request,'dreamy-sky');await pool.query('ALTER TABLE diary.preferences DROP CONSTRAINT preferences_theme_check');await pool.query("UPDATE diary.preferences SET theme='unsupported-legacy'");
  await open(page);await expect(page.locator('html')).toHaveAttribute('data-theme','sakura-pink');await expect(page.getByRole('status',{name:'Preference save status'})).toHaveText('Stored theme needs repair');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Save Sakura Pink repair'}).click();await settingsSaved(page);expect(await read(context.request)).toMatchObject({theme:'sakura-pink',version:2});
 }finally{await pool.query("UPDATE diary.preferences SET theme='sakura-pink' WHERE theme='unsupported-legacy'");await pool.query("ALTER TABLE diary.preferences ADD CONSTRAINT preferences_theme_check CHECK(theme IN ('sakura-pink','dreamy-sky','lavender-dreams','vintage-journal'))");await pool.end();}
});
