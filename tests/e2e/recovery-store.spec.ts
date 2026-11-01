import { test,expect } from "./auth-fixture";
import { build } from "vite";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { IndexedRecovery } from "../../src/lib/diary/recovery-store";
import type { RecoveryRecord,MutationSnapshot } from "../../src/lib/diary/persistence-contracts";
declare global { interface Window { DiaryRecoveryTests: { IndexedRecovery: new () => IndexedRecovery; parseAcknowledgement: typeof import("../../src/lib/diary/persistence-contracts").parseAcknowledgement } } }
let source: string;
test.beforeAll(async()=>{
 const directory=await mkdtemp(`${tmpdir()}/diary-recovery-bundle-`);
 const entry=`${directory}/entry.ts`;
 await writeFile(entry,`export {IndexedRecovery} from ${JSON.stringify(resolve("src/lib/diary/recovery-store.ts"))}; export {parseAcknowledgement} from ${JSON.stringify(resolve("src/lib/diary/persistence-contracts.ts"))};`);
 try {
  const result=await build({configFile:false,logLevel:"silent",build:{lib:{entry,name:"DiaryRecoveryTests",formats:["iife"]},write:false,minify:false}});
  const output=Array.isArray(result)?result[0]:result;
  if(!output||!("output" in output))throw new Error("Unexpected fixture bundle");
  const chunk=output.output.find(item=>item.type==="chunk");if(!chunk||chunk.type!=="chunk")throw new Error("Missing fixture bundle");source=chunk.code;
 } finally { await rm(directory,{recursive:true,force:true}); }
});
test.beforeEach(async({page})=>{
 await page.goto("/recover");
 // Test-only bundle of the actual store, injected with the page nonce. No app endpoint or bypass.
 await page.evaluate(source=>{const script=document.createElement("script");script.nonce=document.querySelector<HTMLScriptElement>("script[nonce]")!.nonce;script.textContent=source;document.head.append(script);},source);
});
test("real IndexedDB serializes writes, rejects stale revisions, and keeps newest text after older acknowledgement",async({page})=>{
 const result=await page.evaluate(async()=>{
  const store=new window.DiaryRecoveryTests.IndexedRecovery();const workspaceId="w1_"+"a".repeat(43),date="2026-11-01" as RecoveryRecord["key"]["date"];
  const key={workspaceId,date,writerId:crypto.randomUUID()};const mutation:MutationSnapshot={date,revision:1,request:{content:"First",baseVersion:0,mutationId:crypto.randomUUID()}};
  const record:RecoveryRecord={schemaVersion:1,key,content:"First",revision:1,baseVersion:0,pending:mutation,updatedAt:new Date().toISOString()};
  const outcomes=await Promise.all([store.commit(record),store.commit({...record,content:"Newer",revision:2}),store.commit(record)]);
  const ack={date,version:1,mutationId:mutation.request.mutationId,updatedAt:new Date().toISOString()};
  let validation="ok";try{window.DiaryRecoveryTests.parseAcknowledgement(mutation,ack);}catch(error){validation=error instanceof Error?error.message:"unknown";}
  const acknowledged=await store.acknowledge(key,mutation,ack);
  const remaining=await store.readOwner(workspaceId);return {outcomes,acknowledged,remaining,validation};
 });
 expect(result.outcomes.map(r=>r.ok)).toEqual([true,true,false]);expect(result.acknowledged,JSON.stringify(result)).toMatchObject({ok:true});
 expect(result.remaining).toMatchObject({ok:true,value:[{content:"Newer",revision:2,baseVersion:1,pending:null}]});
});
test("revision-aware cleanup cannot resurrect acknowledged text or erase a different writer or workspace",async({page})=>{
 const result=await page.evaluate(async()=>{
  const store=new window.DiaryRecoveryTests.IndexedRecovery();const workspaceId="w1_"+"a".repeat(43),date="2026-11-01" as RecoveryRecord["key"]["date"];
  const record:RecoveryRecord={schemaVersion:1,key:{workspaceId,date,writerId:crypto.randomUUID()},content:"Exact",revision:1,baseVersion:0,updatedAt:new Date().toISOString(),pending:{date,revision:1,request:{content:"Exact",baseVersion:0,mutationId:crypto.randomUUID()}}};
  const other={...record,key:{...record.key,writerId:crypto.randomUUID()}};const hidden={...record,key:{...record.key,workspaceId:"w1_"+"b".repeat(43)}};
  await store.commit(record);await store.commit(other);await store.commit(hidden);
  const ack={date,version:1,mutationId:record.pending!.request.mutationId,updatedAt:new Date().toISOString()};
  const acknowledged=await store.acknowledge(record.key,record.pending!,ack);const stale=await store.commit(record);
  return {acknowledged,stale,remaining:await store.readOwner(workspaceId),otherWorkspace:await store.readOwner(hidden.key.workspaceId),otherWriter:other.key.writerId};
 });
 expect(result.acknowledged,JSON.stringify(result)).toMatchObject({ok:true});expect(result.stale).toEqual({ok:false,reason:"stale"});
 expect(result.remaining).toMatchObject({ok:true,value:[{key:{writerId:result.otherWriter}}]});expect(result.otherWorkspace).toMatchObject({ok:true,value:[{content:"Exact"}]});
});
test("storage validates schemas, preserves unsaveable writing, and refuses altered explicit-discard records",async({page})=>{
 const result=await page.evaluate(async()=>{
  const store=new window.DiaryRecoveryTests.IndexedRecovery();const workspaceId="w1_"+"a".repeat(43),date="2026-11-01" as RecoveryRecord["key"]["date"];
  const record:RecoveryRecord={schemaVersion:1,key:{workspaceId,date,writerId:crypto.randomUUID()},content:"\0"+"🌸".repeat(65537),revision:1,baseVersion:0,pending:null,updatedAt:new Date().toISOString()};
  const good=await store.commit(record);const invalid=await store.commit({...record,schemaVersion:2} as unknown as RecoveryRecord);
  const staleDiscard=await store.discard({...record,content:"Other text"});const retained=await store.readOwner(workspaceId);
  const removed=await store.discard(record);return {good,invalid,staleDiscard,retainedLength:retained.ok?retained.value[0]?.content.length:0,removed,after:await store.readOwner(workspaceId)};
 });
 expect(result.good.ok).toBe(true);expect(result.invalid).toEqual({ok:false,reason:"schema"});expect(result.staleDiscard).toEqual({ok:false,reason:"stale"});expect(result.retainedLength).toBeGreaterThan(131072);expect(result.removed.ok).toBe(true);expect(result.after).toEqual({ok:true,value:[]});
});
test("independent store connections use transactional revision checks rather than transaction arrival order",async({page})=>{
 const result=await page.evaluate(async()=>{
  const a=new window.DiaryRecoveryTests.IndexedRecovery(),b=new window.DiaryRecoveryTests.IndexedRecovery();
  const workspaceId="w1_"+"a".repeat(43),date="2026-11-01" as RecoveryRecord["key"]["date"];
  const record:RecoveryRecord={schemaVersion:1,key:{workspaceId,date,writerId:crypto.randomUUID()},content:"Older",revision:1,baseVersion:0,pending:null,updatedAt:new Date().toISOString()};
  await Promise.all([a.commit({...record,content:"Newest",revision:2}),b.commit(record)]);
  return a.readOwner(workspaceId);
 });
 expect(result).toMatchObject({ok:true,value:[{content:"Newest",revision:2}]});
});
test("ordinary newer edits cannot drop unresolved mutation identity; explicit choice compares the prior record atomically",async({page})=>{
 const result=await page.evaluate(async()=>{
  const store=new window.DiaryRecoveryTests.IndexedRecovery(),workspaceId="w1_"+"a".repeat(43),date="2026-11-01" as RecoveryRecord["key"]["date"];
  const record:RecoveryRecord={schemaVersion:1,key:{workspaceId,date,writerId:crypto.randomUUID()},content:"Pending",revision:1,baseVersion:0,updatedAt:new Date().toISOString(),pending:{date,revision:1,request:{content:"Pending",baseVersion:0,mutationId:crypto.randomUUID()}}};
  await store.commit(record);const replacement={...record,content:"Chosen writing",revision:2,pending:null};
  const ordinary=await store.commit(replacement);const incorrect=await store.commit(replacement,{...record,content:"Not the prior record"});const retained=await store.readOwner(workspaceId);
  const deliberate=await store.commit(replacement,record);return {ordinary,incorrect,retained,deliberate,after:await store.readOwner(workspaceId)};
 });
 expect(result.ordinary).toEqual({ok:false,reason:"stale"});expect(result.incorrect).toEqual({ok:false,reason:"stale"});expect(result.retained).toMatchObject({ok:true,value:[{content:"Pending",pending:{request:{content:"Pending"}}}]});expect(result.deliberate.ok).toBe(true);expect(result.after).toMatchObject({ok:true,value:[{content:"Chosen writing",revision:2,pending:null}]});
});
