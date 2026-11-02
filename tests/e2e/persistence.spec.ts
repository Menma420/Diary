import { test,expect,fixtureAdmin,email,password,resetLimits } from "./auth-fixture";
import type { Page,APIRequestContext } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import AxeBuilder from "@axe-core/playwright";
import type { RecoveryRecord } from "../../src/lib/diary/persistence-contracts";
const origin="http://127.0.0.1:3100", path="/api/entries/01/11/2026";
const editor=(page: Page)=>page.locator("#diary-writing");
async function records(page: Page): Promise<RecoveryRecord[]> {
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open("dear-diary-recovery",1);open.onerror=()=>reject(new Error("Recovery read failed"));
  open.onsuccess=()=>{const db=open.result;const tx=db.transaction("drafts","readonly");const request=tx.objectStore("drafts").getAll();request.onsuccess=()=>resolve(request.result);tx.oncomplete=()=>db.close();};
 }));
}
async function read(request: APIRequestContext,date=path) {const response=await request.get(date);expect(response.status()).toBe(200);return (await response.json()).entry as {content:string;version:number;exists:boolean};}
async function put(request: APIRequestContext,content: string,baseVersion=0,date=path,mutationId=crypto.randomUUID()) {
 return request.put(date,{headers:{origin},data:{content,baseVersion,mutationId}});
}
async function open(page: Page) {await page.goto("/diary/01/11/2026");await expect(editor(page)).toBeEditable();}
async function saved(page: Page) {await expect(page.locator("#preview-notice")).toHaveText("Saved");await expect.poll(async()=> (await records(page)).length).toBe(0);}
async function seed(page: Page, drafts: RecoveryRecord[]) {
 await page.evaluate(drafts=>new Promise<void>((resolve,reject)=>{
 const request=indexedDB.open("dear-diary-recovery",1);request.onsuccess=()=>{const db=request.result,tx=db.transaction("drafts","readwrite");for(const draft of drafts)tx.objectStore("drafts").put(draft);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(new Error("Fixture transaction failed"));};
 }),drafts);
}
test("write, refresh and explicit empty clear retain PostgreSQL versions and remove acknowledged recovery",async({page,context})=>{
 await open(page);await editor(page).fill("Durable 🌸\n whitespace ");await saved(page);expect(await read(context.request)).toMatchObject({content:"Durable 🌸\n whitespace ",version:1,exists:true});
 await page.reload();await expect(editor(page)).toHaveValue("Durable 🌸\n whitespace ");await editor(page).fill("");await saved(page);await page.reload();await expect(editor(page)).toHaveValue("");
 expect(await read(context.request)).toMatchObject({content:"",version:2,exists:true});expect(await records(page)).toEqual([]);
});
test("navigate before debounce; A acknowledgement while B is active never changes B",async({page,context})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let requested!:()=>void;const dispatched=new Promise<void>(r=>requested=r);
 await page.route(`**${path}`,async route=>{if(route.request().method()==="PUT"){requested();await gate;}await route.continue();});
 await open(page);await editor(page).fill("Date A");await page.getByRole("button",{name:"Next day"}).click();await expect(page).toHaveURL(/02\/11\/2026$/);await expect(editor(page)).toHaveAttribute("data-editor-date","2026-11-02");await expect(editor(page)).toBeEditable();await editor(page).fill("Date B");await dispatched;
 await expect.poll(async()=> (await read(context.request,"/api/entries/02/11/2026")).content).toBe("Date B");release();await expect.poll(async()=> (await read(context.request)).content).toBe("Date A");
 await expect(editor(page)).toHaveValue("Date B");await expect.poll(async()=> (await records(page)).length).toBe(0);
 expect((await read(context.request)).version).toBe(1);expect((await read(context.request,"/api/entries/02/11/2026")).version).toBe(1);
});
test("typing during committed but delayed acknowledgement preserves newer text, caret and recovery",async({page,context})=>{
 let release!:()=>void, committed!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>committed=r);let first=true;
 await page.route(`**${path}`,async route=>{if(route.request().method()==="PUT"&&first){first=false;const response=await route.fetch();committed();await gate;await route.fulfill({response});}else await route.continue();});
 await open(page);await editor(page).fill("First");await ready;await editor(page).fill("Newer draft");await editor(page).evaluate((node:HTMLTextAreaElement)=>{node.focus();node.setSelectionRange(1,5,"backward");node.dataset.original="yes";});
 await expect.poll(async()=> (await records(page))[0]?.content).toBe("Newer draft");const pending=(await records(page))[0]!.pending!;expect(pending.request.content).toBe("First");release();
 await expect(editor(page)).toHaveValue("Newer draft");await saved(page);expect(await read(context.request)).toMatchObject({content:"Newer draft",version:2});await expect(editor(page)).toBeFocused();await expect(editor(page)).toHaveAttribute("data-original","yes");
 expect(await editor(page).evaluate((node:HTMLTextAreaElement)=>[node.selectionStart,node.selectionEnd,node.selectionDirection])).toEqual([1,5,"backward"]);
});
test("commit with dropped response retries exact mutation and does not increment twice",async({page,context})=>{
 let first=true;const payloads:string[]=[];
 await page.route(`**${path}`,async route=>{if(route.request().method()==="PUT"){payloads.push(route.request().postData()!);if(first){first=false;await route.fetch();await route.abort("failed");return;}}await route.continue();});
 await open(page);await editor(page).fill("Unknown commit");await expect(page.locator("#preview-notice")).toHaveText("Save failed");const pending=(await records(page))[0]!.pending!;
 expect(await read(context.request)).toMatchObject({content:"Unknown commit",version:1});await page.getByRole("button",{name:"Retry",exact:true}).click();await saved(page);
 expect(payloads).toHaveLength(2);expect(payloads[0]).toBe(payloads[1]);expect(JSON.parse(payloads[1]!).mutationId).toBe(pending.request.mutationId);expect((await read(context.request)).version).toBe(1);
});
test("another device advances server; conflict retains both versions and deliberate local choice uses latest base",async({page,context},info)=>{
 await open(page);expect((await put(context.request,"Other device")).status()).toBe(200);await editor(page).fill("My local writing");await expect(page.locator("#preview-notice")).toHaveText("Conflict · review writing");
 expect((await records(page))[0]?.content).toBe("My local writing");expect((await read(context.request)).content).toBe("Other device");await expect(editor(page)).not.toBeEditable();await page.getByRole("button",{name:/Review conflict/}).click();
 const dialog=page.getByRole("dialog");await expect(dialog).toContainText("Other device");await expect(dialog).toContainText("My local writing");expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa"]).analyze()).violations).toEqual([]);
 await page.screenshot({path:`artifacts/phase-8/conflict-${info.project.name}.png`,fullPage:true});
 await dialog.getByRole("button",{name:/Keep local writing 1/}).click();await saved(page);expect(await read(context.request)).toMatchObject({content:"My local writing",version:2});await expect(editor(page)).toHaveValue("My local writing");
});
test("server advances again while conflict is open; choice requires renewed review",async({page,context})=>{
 await open(page);await put(context.request,"First remote");await editor(page).fill("Local");await page.getByRole("button",{name:/Review conflict/}).click();await put(context.request,"Second remote",1);
 await page.getByRole("button",{name:/Keep local writing 1/}).click();await expect(page.getByRole("dialog")).toContainText("Second remote");expect((await read(context.request)).content).toBe("Second remote");expect((await records(page))[0]?.content).toBe("Local");
 await page.getByRole("button",{name:/Keep server version/}).click();await expect(editor(page)).toHaveValue("Second remote");expect(await records(page)).toEqual([]);expect((await read(context.request)).version).toBe(2);
});
test("reload recovers all affected dates and writers, including non-visible dates",async({page,context})=>{
 await open(page);const access=await (await context.request.get("/api/session")).json();
 const drafts:RecoveryRecord[]=["2026-11-01","2026-11-02","2026-11-03"].map((date,index)=>({schemaVersion:1,key:{workspaceId:access.workspaceId,date:date as RecoveryRecord["key"]["date"],writerId:crypto.randomUUID()},content:index===2?"":`Recovered ${index}`,revision:1,baseVersion:0,updatedAt:new Date().toISOString(),pending:null}));
 await seed(page,drafts);await page.reload();await expect(editor(page)).toHaveValue("Recovered 0");await expect.poll(async()=> (await records(page)).length).toBe(0);
 for(const [index,date] of ["01","02","03"].entries()) expect(await read(context.request,`/api/entries/${date}/11/2026`)).toMatchObject({exists:true,content:index===2?"":`Recovered ${index}`,version:1});
});
test("recovery of multiple writers and advanced bases preserves every draft without choosing by timestamp",async({page,context})=>{
 await open(page);const access=await (await context.request.get("/api/session")).json();await put(context.request,"Server writing");
 const drafts:RecoveryRecord[]=["Writer A","Writer B"].map(content=>({schemaVersion:1,key:{workspaceId:access.workspaceId,date:"2026-11-01" as RecoveryRecord["key"]["date"],writerId:crypto.randomUUID()},content,revision:1,baseVersion:0,updatedAt:new Date().toISOString(),pending:null}));
 await seed(page,drafts);await page.reload();await page.getByRole("button",{name:/Review conflict/}).click();const dialog=page.getByRole("dialog");for(const content of ["Server writing","Writer A","Writer B"])await expect(dialog).toContainText(content);
 expect((await records(page)).map(r=>r.content).sort()).toEqual(["Writer A","Writer B"]);expect(await read(context.request)).toMatchObject({content:"Server writing",version:1});
 await dialog.getByRole("button",{name:/Keep local writing 2/}).click();await saved(page);expect((await read(context.request)).version).toBe(2);
});
test("revoked session pauses dirty writes; same-owner reauthentication retains workspace and resumes",async({page,context})=>{
 await open(page);await editor(page).fill("Paused private writing");await expect.poll(async()=> (await records(page))[0]?.content).toBe("Paused private writing");
 const pool=await fixtureAdmin();try{await pool.query("DELETE FROM auth_session");}finally{await pool.end();}await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(page.getByRole("heading",{name:"Sign in to continue writing"})).toBeVisible();await expect(editor(page)).toHaveValue("Paused private writing");expect((await records(page))[0]?.content).toBe("Paused private writing");
 await resetLimits();await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(editor(page)).toBeVisible();await saved(page);expect(await read(context.request)).toMatchObject({content:"Paused private writing",version:1});
});
for(const failure of ["quota","transaction","schema","blocked"] as const)test(`${failure} recovery failure preserves memory, reports degraded durability and still saves to server`,async({page,context},info)=>{
 await page.addInitScript((failure)=>{
  if(failure==="quota"){IDBObjectStore.prototype.put=function(){throw new DOMException("Synthetic quota failure","QuotaExceededError");};}
  if(failure==="transaction"){IDBDatabase.prototype.transaction=function(){throw new DOMException("Synthetic transaction failure","InvalidStateError");};}
  if(failure==="schema"){const original=IDBFactory.prototype.open;IDBFactory.prototype.open=function(name,version){if(name==="dear-diary-recovery")throw new DOMException("Synthetic schema failure","VersionError");return original.call(this,name,version);};}
  if(failure==="blocked"){
   const original=IDBFactory.prototype.open;
   const held=original.call(indexedDB,"dear-diary-recovery",1);held.onupgradeneeded=()=>{const db=held.result;const store=db.createObjectStore("drafts",{keyPath:["key.workspaceId","key.date","key.writerId"]});store.createIndex("workspace","key.workspaceId");db.createObjectStore("receipts");};held.onsuccess=()=>{held.result.onversionchange=()=>{};};
   IDBFactory.prototype.open=function(name,version){return original.call(this,name,name==="dear-diary-recovery"?2:version);};
  }
 },failure);
 await open(page);await editor(page).fill(`Memory survives ${failure}`);await expect(page.getByText("Recovery unavailable · keep this tab open")).toBeVisible();await expect(page.getByText("Draft stored on this device",{exact:true})).toHaveCount(0);
 await expect(page.locator("#preview-notice")).toHaveText("Saved");await expect(editor(page)).toHaveValue(`Memory survives ${failure}`);expect(await read(context.request)).toMatchObject({content:`Memory survives ${failure}`,version:1});
 if(failure==="quota")await page.screenshot({path:`artifacts/phase-8/recovery-unavailable-${info.project.name}.png`,fullPage:true});
});
test("local-only recovery never says Saved; failed logout flush preserves writing and pending metadata",async({page,context})=>{
 await page.route("**/api/entries/**",route=>route.request().method()==="PUT"?route.fulfill({status:503,json:{error:"Synthetic network outage"}}):route.continue());
 await open(page);await editor(page).fill("Only local writing");await expect(page.getByText("Draft stored on this device",{exact:true})).toBeVisible();await expect(page.locator("#preview-notice")).not.toHaveText("Saved");
 await page.getByRole("button",{name:"Sign out",exact:true}).click();await page.getByRole("button",{name:"Save and sign out"}).click();await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Writing is unresolved");await expect(editor(page)).toHaveValue("Only local writing");expect((await records(page))[0]?.pending?.request.content).toBe("Only local writing");expect((await read(context.request)).exists).toBe(false);
 await page.getByRole("button",{name:"Keep writing"}).click();await page.unrouteAll();await page.getByRole("button",{name:"Retry",exact:true}).click();await saved(page);expect((await read(context.request)).content).toBe("Only local writing");
});
test("failed read locks the empty editor; every entry operation authorizes and validates origin and identity",async({page,context,request})=>{
 expect((await request.get(path)).status()).toBe(401);expect((await request.put(path,{headers:{origin},data:{content:"No owner",baseVersion:0,mutationId:crypto.randomUUID()}})).status()).toBe(401);
 await page.route(`**${path}`,route=>route.fulfill({status:503,json:{error:"Synthetic read failure"}}));await page.goto("/diary/01/11/2026");await expect(page.locator("#preview-notice")).toHaveText("Could not load diary");await expect(editor(page)).not.toBeEditable();await page.unrouteAll();await page.getByRole("button",{name:"Retry",exact:true}).click();await expect(editor(page)).toBeEditable();
 const response=await context.request.get(path);expect(response.headers()["cache-control"]).toContain("no-store");expect(await response.text()).not.toContain("12345678-1234-4234-8234-123456789abc");
 expect((await context.request.put(path,{headers:{origin:"https://evil.example"},data:{}})).status()).toBe(403);
 expect((await context.request.put(path,{headers:{origin},data:{content:"Forged",baseVersion:0,mutationId:crypto.randomUUID(),ownerId:"12345678-1234-4234-8234-123456789abc"}})).status()).toBe(400);
 expect((await context.request.get("/api/entries/29/02/2026")).status()).toBe(400);expect((await read(context.request)).exists).toBe(false);expect(await records(page)).toEqual([]);
 const token=crypto.randomUUID(),admin=await fixtureAdmin();try{await admin.query('INSERT INTO auth_session(id,token,"userId","createdAt","updatedAt","expiresAt") VALUES($1,$1,\'fixture-other\',now(),now(),now()+interval \'1 hour\')',[token]);}finally{await admin.end();}
 const signature=await makeSignature(token,process.env.BETTER_AUTH_SECRET!);
 await context.addCookies([{name:"__Secure-dear-diary.session_token",value:encodeURIComponent(`${token}.${signature}`),domain:"127.0.0.1",path:"/",httpOnly:true,secure:true,sameSite:"Lax"}]);
 expect((await context.request.get(path)).status()).toBe(403);expect((await put(context.request,"Non-owner writing")).status()).toBe(403);
});
test("reload after an unknown commit retries retained exact metadata against the real ledger",async({page,context})=>{
 let lost=false;await page.route(`**${path}`,async route=>{if(route.request().method()==="PUT"&&!lost){lost=true;await route.fetch();await route.abort();}else await route.continue();});
 await open(page);await editor(page).fill("Recovered uncertain commit");await expect(page.locator("#preview-notice")).toHaveText("Save failed");const original=(await records(page))[0]!.pending!;
 await page.unrouteAll();await page.reload();await expect(editor(page)).toHaveValue("Recovered uncertain commit");await expect.poll(async()=> (await records(page)).length).toBe(0);expect(await read(context.request)).toMatchObject({content:"Recovered uncertain commit",version:1});
 const pool=await fixtureAdmin();try{const ledger=await pool.query("SELECT mutation_id FROM diary.mutations WHERE entry_date='2026-11-01'");expect(ledger.rows.map(row=>row.mutation_id)).toEqual([original.request.mutationId]);}finally{await pool.end();}
 await editor(page).fill("Writing after recovered acknowledgement");await saved(page);expect(await read(context.request)).toMatchObject({content:"Writing after recovered acknowledgement",version:2});await expect(page.getByText("Recovery unavailable · keep this tab open")).toHaveCount(0);
});
test("a newly authenticated different owner scope never loads another scope's recovery records",async({page,context})=>{
 await page.route("**/api/entries/**",route=>route.request().method()==="PUT"?route.fulfill({status:503,json:{error:"Synthetic unavailable"}}):route.continue());
 await open(page);await editor(page).fill("Original owner local recovery");await expect.poll(async()=> (await records(page))[0]?.content).toBe("Original owner local recovery");const original=await records(page);
 const pool=await fixtureAdmin();try{
  await pool.query("DELETE FROM auth_session");await pool.query("UPDATE private.diary_owner SET owner_id='87654321-1234-4234-8234-123456789abc',auth_user_id='fixture-other'");await resetLimits();
  const response=await context.request.post("/api/auth/sign-in/email",{headers:{origin},data:{email:"other@example.invalid",password}});expect(response.status()).toBe(200);
  await page.reload();await expect(editor(page)).toBeEditable();await expect(editor(page)).toHaveValue("");await expect(page.getByRole("button",{name:/Review conflict/})).toHaveCount(0);expect(await records(page)).toEqual(original);
  const current=await(await context.request.get("/api/session")).json();expect(current.workspaceId).not.toBe(original[0]!.key.workspaceId);expect((await read(context.request)).exists).toBe(false);
 }finally{await pool.query("DELETE FROM auth_session");await pool.query("UPDATE private.diary_owner SET owner_id='12345678-1234-4234-8234-123456789abc',auth_user_id='fixture-owner'");await pool.end();}
});
test("a lost historical commit acknowledgement cannot say Saved after another device advances",async({page,context})=>{
 let first=true;await page.route(`**${path}`,async route=>{if(route.request().method()==="PUT"&&first){first=false;await route.fetch();await route.abort();}else await route.continue();});
 await open(page);await editor(page).fill("Older confirmed writing");await expect(page.locator("#preview-notice")).toHaveText("Save failed");const pending=(await records(page))[0]!.pending!;
 expect((await put(context.request,"Newer remote writing",1)).status()).toBe(200);await page.getByRole("button",{name:"Retry",exact:true}).click();await expect(page.locator("#preview-notice")).toHaveText("Conflict · review writing");
 expect((await records(page))[0]?.pending).toEqual(pending);await expect(editor(page)).toHaveValue("Older confirmed writing");expect(await read(context.request)).toMatchObject({content:"Newer remote writing",version:2});
 await page.getByRole("button",{name:/Review conflict/}).click();await expect(page.getByRole("dialog")).toContainText("Older confirmed writing");await expect(page.getByRole("dialog")).toContainText("Newer remote writing");
 await page.getByRole("button",{name:/Keep server version/}).click();await expect(editor(page)).toHaveValue("Newer remote writing");expect(await records(page)).toEqual([]);expect((await read(context.request)).version).toBe(2);
 await editor(page).fill("Writing after choosing server");await saved(page);expect(await read(context.request)).toMatchObject({content:"Writing after choosing server",version:3});await expect(page.getByText("Recovery unavailable · keep this tab open")).toHaveCount(0);
});
test("reauthentication discovers another writer during an in-flight save and its late acknowledgement cannot erase that writer",async({page,context})=>{
 let release!:()=>void,committed!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>committed=r);let first=true;
 await page.route(`**${path}`,async route=>{if(route.request().method()==="PUT"&&first){first=false;const response=await route.fetch();committed();await gate;await route.fulfill({response});}else await route.continue();});
 await open(page);await editor(page).fill("Current writer commit");await ready;const access=await(await context.request.get("/api/session")).json();
 const other:RecoveryRecord={schemaVersion:1,key:{workspaceId:access.workspaceId,date:"2026-11-01" as RecoveryRecord["key"]["date"],writerId:crypto.randomUUID()},content:"Other writer must survive",revision:1,baseVersion:0,pending:null,updatedAt:new Date().toISOString()};await seed(page,[other]);
 const pool=await fixtureAdmin();try{await pool.query("DELETE FROM auth_session");}finally{await pool.end();}await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByRole("heading",{name:"Sign in to continue writing"})).toBeVisible();
 await resetLimits();await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:/Review conflict/})).toBeVisible();release();
 await expect.poll(async()=> (await records(page)).map(record=>record.content)).toEqual(["Other writer must survive"]);await expect(page.locator("#preview-notice")).toHaveText("Conflict · review writing");expect(await read(context.request)).toMatchObject({content:"Current writer commit",version:1});
 await page.getByRole("button",{name:/Review conflict/}).click();await expect(page.getByRole("dialog")).toContainText("Other writer must survive");await page.getByRole("button",{name:/Keep local writing 1/}).click();await saved(page);expect(await read(context.request)).toMatchObject({content:"Other writer must survive",version:2});
});
test("reload preserves newer local text while retrying an older uncertain snapshot before its next save",async({page,context})=>{
 let first=true;await page.route(`**${path}`,async route=>{if(route.request().method()==="PUT"&&first){first=false;await route.fetch();await route.abort();}else await route.continue();});
 await open(page);await editor(page).fill("Older immutable snapshot");await expect(page.locator("#preview-notice")).toHaveText("Save failed");const original=(await records(page))[0]!.pending!;
 await editor(page).fill("Newer recovered writing");await expect.poll(async()=> (await records(page))[0]?.content).toBe("Newer recovered writing");expect((await records(page))[0]?.pending).toEqual(original);
 await page.reload();await expect(editor(page)).toHaveValue("Newer recovered writing");await saved(page);expect(await read(context.request)).toMatchObject({content:"Newer recovered writing",version:2});
 const pool=await fixtureAdmin();try{const result=await pool.query("SELECT mutation_id,version::integer FROM diary.mutations WHERE entry_date='2026-11-01' ORDER BY version");expect(result.rows).toHaveLength(2);expect(result.rows[0]?.mutation_id).toBe(original.request.mutationId);expect(result.rows.map(row=>row.version)).toEqual([1,2]);}finally{await pool.end();}
});
