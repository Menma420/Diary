import { test,expect,email,password,resetLimits,fixtureAdmin } from './auth-fixture';
import type { Page,APIRequestContext } from '@playwright/test';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { selectDecorations } from '../../src/lib/decorations';
import { parseDisplayDate } from '../../src/lib/dates';
declare global { interface Window { decorationShifts?: number[] } }
const origin='http://127.0.0.1:3100';
const themes=['sakura-pink','dreamy-sky','lavender-dreams','vintage-journal'] as const;
function expectedArrangement(ownerScope:string,date:string,theme:typeof themes[number]='sakura-pink'){
 return JSON.stringify(selectDecorations({ownerScope,date:parseDisplayDate(date)!,theme}).map(({asset,corner,sizePercent,rotation})=>({assetId:asset.id,corner,sizePercent,rotation})));
}
const arrangement=(page:Page)=>page.locator('[data-artwork]').getAttribute('data-arrangement');
const editor=(page:Page)=>page.locator('#diary-writing');
async function open(page:Page,path='/diary/31/10/2026'){await page.goto(path);await expect(editor(page)).toBeEditable();}
async function records(page:Page){return page.evaluate(()=>new Promise<unknown[]>((resolve,reject)=>{const r=indexedDB.open('dear-diary-recovery',1);r.onerror=()=>reject(Error('Fixture recovery read failed'));r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts'),all=tx.objectStore('drafts').getAll();all.onsuccess=()=>resolve(all.result);tx.oncomplete=()=>db.close();};}));}
async function login(request:APIRequestContext){await resetLimits();expect((await request.post('/api/auth/sign-in/email',{headers:{origin},data:{email,password}})).status()).toBe(200);}
async function geometry(page:Page){return page.evaluate(()=>{
 const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
 return {paper:box('section[aria-label="Diary paper"]'),editor:box('textarea'),date:box('time'),lineHeight:getComputedStyle(document.querySelector('textarea')!).lineHeight,overflow:document.documentElement.scrollWidth>innerWidth};
});}
async function safeCorners(page:Page){return page.evaluate(()=>{
 const paper=document.querySelector('section[aria-label="Diary paper"]')!.getBoundingClientRect();
 const protectedBoxes=[...document.querySelectorAll('textarea,time,button,select')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());
 const cards=[...document.querySelectorAll<HTMLElement>('[data-artwork] > div')].filter(e=>getComputedStyle(e).display!=='none');
 const intersect=(a:DOMRect,b:DOMRect)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 return {count:cards.length,inside:cards.every(e=>{const b=e.getBoundingClientRect();return b.left>=paper.left&&b.right<=paper.right&&b.top>=paper.top&&b.bottom<=paper.bottom;}),overlap:cards.some(e=>protectedBoxes.some(b=>intersect(e.getBoundingClientRect(),b))),pointerEvents:getComputedStyle(document.querySelector('[data-artwork]')!).pointerEvents};
});}
test('theme/date arrangements have safe responsive corners, reserved dimensions, no overflow and accessible artwork',async({page,context},info)=>{
 await mkdir('artifacts/phase-8',{recursive:true});await open(page);const baseline=await geometry(page);const distinct=new Set<string>(),scope=(await(await context.request.get('/api/session')).json()).workspaceId;
 for(const theme of themes){
  await page.getByRole('combobox',{name:'Theme preview'}).selectOption(theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  if(theme!=='sakura-pink')await expect(page.getByRole('status',{name:'Preference save status'})).toHaveText('Settings saved');
  for(const date of ['31/10/2026','01/11/2026']){
   await open(page,`/diary/${date}`);const value=(await arrangement(page))!;expect(value).toBe(expectedArrangement(scope,date,theme));distinct.add(value);expect(await geometry(page)).toEqual(baseline);
   expect(await safeCorners(page)).toEqual({count:info.project.name==='chromium'?4:2,inside:true,overlap:false,pointerEvents:'none'});
   for(const image of await page.locator('[data-artwork] img:visible').all()){await expect.poll(()=>image.evaluate((n:HTMLImageElement)=>n.complete&&n.naturalWidth===96)).toBe(true);await expect(image).toHaveAttribute('alt','');}
   await page.screenshot({path:`artifacts/phase-8/decorations-${info.project.name}-${theme}-${date.replaceAll('/','-')}.png`,fullPage:true});
  }
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 }
 expect(distinct.size).toBeGreaterThanOrEqual(4); // Date pairs need not be unique; unit tests sample 90 dates.
});
test('typing, immutable in-flight save, theme roundtrip and revisiting preserve arrangements and writing identity',async({page,context})=>{
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);let writes=0,body='';
 await page.route('**/api/entries/**',async route=>{if(route.request().method()==='PUT'){writes++;body=route.request().postData()!;const response=await route.fetch();started();await gate;await route.fulfill({response});}else await route.continue();});
 await open(page);const first=await arrangement(page),scope=(await(await context.request.get('/api/session')).json()).workspaceId;await editor(page).fill('Synthetic stable arrangement\n'.repeat(45));await ready;const pending=await records(page),count=writes,snapshot=body;
 await editor(page).evaluate((n:HTMLTextAreaElement)=>{n.dataset.original='yes';n.focus();n.setSelectionRange(4,12,'backward');window.scrollTo(0,300);});const scroll=await page.evaluate(()=>scrollY),box=await editor(page).boundingBox();
 await editor(page).dispatchEvent('compositionstart');
 for(const theme of ['lavender-dreams','sakura-pink']){const control=page.getByRole('combobox',{name:'Theme preview'});await control.dispatchEvent('pointerdown');await control.selectOption(theme);await expect(page.getByRole('status',{name:'Preference save status'})).toHaveText('Settings saved');}
 expect(await arrangement(page)).toBe(first);expect(await records(page)).toEqual(pending);expect(writes).toBe(count);expect(body).toBe(snapshot);expect(await editor(page).boundingBox()).toEqual(box);
 await expect(editor(page)).toHaveAttribute('data-original','yes');await expect(editor(page)).toBeFocused();expect(await editor(page).evaluate((n:HTMLTextAreaElement)=>[n.selectionStart,n.selectionEnd,n.selectionDirection])).toEqual([4,12,'backward']);expect(await page.evaluate(()=>scrollY)).toBe(scroll);
 await editor(page).dispatchEvent('compositionend');release();await expect(page.locator('#preview-notice')).toHaveText('Saved');expect(await arrangement(page)).toBe(first);expect(await records(page)).toEqual([]);
 await page.getByRole('button',{name:'Next day',exact:true}).click();await expect(page).toHaveURL(/01\/11\/2026$/);await expect(editor(page)).toHaveAttribute('data-editor-date','2026-11-01');expect(await arrangement(page)).toBe(expectedArrangement(scope,'01/11/2026'));
 await page.getByRole('button',{name:'Previous day',exact:true}).click();await expect(page).toHaveURL(/31\/10\/2026$/);await expect(editor(page)).toHaveValue('Synthetic stable arrangement\n'.repeat(45));expect(await arrangement(page)).toBe(first);
 await page.reload();await expect(editor(page)).toHaveValue('Synthetic stable arrangement\n'.repeat(45));expect(await arrangement(page)).toBe(first);
 expect((await(await context.request.get('/api/entries/31/10/2026')).json()).entry).toMatchObject({version:1,content:'Synthetic stable arrangement\n'.repeat(45)});
});
test('unresolved recovery and same-owner reauthentication keep decorations, mutation identity and newer writing intact',async({page})=>{
 await page.route('**/api/entries/**',route=>route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Synthetic unavailable'}}):route.continue());
 await open(page);const first=await arrangement(page);await editor(page).fill('Synthetic unresolved decoration review');await expect(page.locator('#preview-notice')).toHaveText('Save failed');const before=await records(page);
 const pool=await fixtureAdmin();try{await pool.query('DELETE FROM auth_session');}finally{await pool.end();}
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('heading',{name:'Sign in to continue writing'})).toBeVisible();
 await resetLimits();await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(editor(page)).toBeEditable();
 await expect(editor(page)).toHaveValue('Synthetic unresolved decoration review');expect(await arrangement(page)).toBe(first);expect(await records(page)).toEqual(before);await expect(page.getByText(/^Saved$/)).toHaveCount(0);
});
test('Node server selection, separate authenticated browser sessions and viewport resizing select identical metadata',async({page,context,browser})=>{
 await open(page);const first=await arrangement(page);const html=await(await context.request.get('/diary/31/10/2026')).text();
 const access=await(await context.request.get('/api/session')).json();
 expect(expectedArrangement(access.workspaceId,'31/10/2026')).toBe(first);expect(html).not.toContain('12345678-1234-4234-8234-123456789abc');
 const other=await browser.newContext({viewport:{width:390,height:844}});try{await login(other.request);const second=await other.newPage();await open(second);expect(await arrangement(second)).toBe(first);await second.setViewportSize({width:1053,height:662});expect(await arrangement(second)).toBe(first);expect((await safeCorners(second)).count).toBe(4);await second.setViewportSize({width:320,height:740});expect(await arrangement(second)).toBe(first);expect((await safeCorners(second)).count).toBe(2);}finally{await other.close();}
});
test('failed illustration requests preserve paper, date, editor and scroll without layout shift or writes',async({page},info)=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let writes=0;
 await page.addInitScript(()=>{const values:number[]=[];Object.assign(window,{decorationShifts:values});new PerformanceObserver(list=>{for(const e of list.getEntries())if('hadRecentInput' in e&&!e.hadRecentInput&&'value' in e)values.push(e.value as number);}).observe({type:'layout-shift',buffered:true});});
 await page.route('**/decorations/v1/*.svg',async route=>{await gate;await route.abort();});page.on('request',r=>{if(r.method()==='PUT'&&r.url().includes('/api/entries/'))writes++;});
 await page.goto('/diary/31/10/2026',{waitUntil:'domcontentloaded'});await expect(editor(page)).toBeEditable();
 await editor(page).dispatchEvent('compositionstart');await editor(page).fill('Synthetic writing before image failure');
 await editor(page).evaluate((n:HTMLTextAreaElement)=>{n.dataset.original='yes';n.focus();n.setSelectionRange(2,8,'backward');});
 const before=await geometry(page),first=await arrangement(page),scroll=await page.evaluate(()=>scrollY);release();
 await expect(page.locator('[data-artwork] > div[data-failed]')).toHaveCount(info.project.name==='chromium'?4:2);
 expect(await geometry(page)).toEqual(before);expect(await arrangement(page)).toBe(first);expect(writes).toBe(0);await expect(editor(page)).toBeEditable();
 await expect(editor(page)).toHaveValue('Synthetic writing before image failure');await expect(editor(page)).toHaveAttribute('data-original','yes');await expect(editor(page)).toBeFocused();
 expect(await editor(page).evaluate((n:HTMLTextAreaElement)=>[n.selectionStart,n.selectionEnd,n.selectionDirection])).toEqual([2,8,'backward']);expect(await page.evaluate(()=>scrollY)).toBe(scroll);
 expect(await page.evaluate(()=>(window.decorationShifts??[]).reduce((a,b)=>a+b,0))).toBeLessThan(0.001);
});
test('narrow viewports omit secondary image downloads; original files stay local and compact',async({page},info)=>{
 const requested=new Set<string>();page.on('request',r=>{if(r.url().includes('/decorations/v1/'))requested.add(r.url());});await open(page);
 await expect.poll(()=>page.locator('[data-artwork] img:visible').evaluateAll(images=>images.every(i=>(i as HTMLImageElement).complete))).toBe(true);
 await page.waitForTimeout(150);expect(requested.size).toBe(info.project.name==='chromium'?4:2);for(const url of requested)expect(url.startsWith(origin+'/decorations/v1/')).toBe(true);
 const inventory=JSON.parse(await readFile('artifacts/phase-8/asset-manifest.json','utf8'));expect(Math.max(...Object.values(inventory.maximumFourAssetGzipBytesByTheme) as number[])).toBeLessThan(200*1024);
 await writeFile(`artifacts/phase-8/loading-${info.project.name}.json`,JSON.stringify({requestedAssets:requested.size,visibleAssets:(await safeCorners(page)).count,localOnly:true},null,2)+'\n');
});
