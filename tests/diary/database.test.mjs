import { before,after,test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startFixture,fixtureOwner } from "../../scripts/auth/fixture.mjs";
import { assertDiaryRuntime,readEntry,writeEntry } from "../../src/lib/diary/repository.server.ts";
let fixture;
const owner={ ownerId: fixtureOwner,expiresAt: new Date(Date.now()+86400000).toISOString() };
const date="2026-11-02";
before(async()=>{ fixture=await startFixture(); });
after(async()=>{ await fixture?.close(); });
const put=(date,content,baseVersion=0,mutationId=randomUUID())=>writeEntry(owner,date,{ content,baseVersion,mutationId },fixture.diary);
test("diary runtime has only controlled function execution; auth and operator connections are rejected",async()=>{
 await assertDiaryRuntime(fixture.diary);
 await assert.rejects(assertDiaryRuntime(fixture.admin));
 await assert.rejects(assertDiaryRuntime(fixture.runtime));
 for (const sql of ["SELECT * FROM diary.entries","INSERT INTO diary.entries(owner_id,entry_date,content,version,mutation_id) VALUES(gen_random_uuid(),current_date,'',1,gen_random_uuid())","SELECT * FROM auth_account","SELECT * FROM private.diary_owner","TRUNCATE diary.entries","SET ROLE diary_data_owner"]) await assert.rejects(fixture.diary.query(sql));
 await fixture.admin.query("GRANT UPDATE(content) ON diary.entries TO diary_entry_runtime");
 try { await assert.rejects(assertDiaryRuntime(fixture.diary)); } finally { await fixture.admin.query("REVOKE UPDATE(content) ON diary.entries FROM diary_entry_runtime"); }
});
test("missing singleton binding denies database reads and writes",async()=>{
 await fixture.admin.query("DELETE FROM private.diary_owner");
 try {
  await assert.rejects(readEntry(owner,date,fixture.diary));
  await assert.rejects(put(date,"Must fail closed"));
 } finally { await fixture.admin.query("INSERT INTO private.diary_owner(owner_id,auth_user_id) VALUES($1,'fixture-owner')",[fixtureOwner]); }
});
test("missing reads differ from empty persisted rows; strict date strings roundtrip including year 0099",async()=>{
 assert.deepEqual(await readEntry(owner,date,fixture.diary),{ exists: false,date,content: "",version: 0 });
 await put(date,""); const empty=await readEntry(owner,date,fixture.diary);
 assert.equal(empty.exists,true); assert.equal(empty.content,""); assert.equal(empty.version,1);
 await put("0099-01-02","Calendar date"); assert.equal((await readEntry(owner,"0099-01-02",fixture.diary)).date,"0099-01-02");
});
test("owner mismatch fails within the database functions",async()=>{
 const second={...owner,ownerId: randomUUID()};
 await assert.rejects(readEntry(second,date,fixture.diary));
 await assert.rejects(writeEntry(second,date,{content:"Forbidden",baseVersion:0,mutationId:randomUUID()},fixture.diary));
});
test("concurrent missing-date creation produces one row and one explicit conflict",async()=>{
 const target="2026-11-03";
 const results=await Promise.all([put(target,"Device A"),put(target,"Device B")]);
 assert.deepEqual(results.map(r=>r.kind).sort(),["acknowledged","conflict"]);
 const result=await fixture.admin.query("SELECT version FROM diary.entries WHERE entry_date=$1",[target]);
 assert.equal(result.rowCount,1); assert.equal(Number(result.rows[0].version),1);
});
test("optimistic concurrency never overwrites advanced text",async()=>{
 const target="2026-11-04"; await put(target,"First"); await put(target,"Second",1);
 const conflict=await put(target,"Stale",1); assert.equal(conflict.kind,"conflict"); assert.equal(conflict.current.content,"Second");
 assert.equal((await readEntry(owner,target,fixture.diary)).version,2);
});
test("concurrent exact retries increment once and historical retries return original acknowledgement",async()=>{
 const target="2026-11-05",id=randomUUID().toUpperCase(); const results=await Promise.all(Array.from({length:8},()=>put(target,"Exact",0,id)));
 for (const result of results) assert.deepEqual(result,results[0]);
 await put(target,"Later",1);
 assert.deepEqual(await put(target,"Exact",0,id),results[0]);
 assert.equal((await readEntry(owner,target,fixture.diary)).content,"Later");
 assert.equal((await readEntry(owner,target,fixture.diary)).version,2);
});
test("mutation ID reuse with changed content, date, or base is rejected",async()=>{
 const target="2026-11-06",id=randomUUID(); await put(target,"Exact",0,id);
 for (const [d,c,b] of [[target,"Changed",0],[target,"Exact",1],["2026-11-07","Exact",0]]) await assert.rejects(put(d,c,b,id));
 const rejectedId=randomUUID();
 assert.equal((await put(target,"Rejected stale request",0,rejectedId)).kind,"conflict");
 assert.equal((await put(target,"Rejected stale request",0,rejectedId)).kind,"conflict");
 await assert.rejects(put(target,"Rejected stale request",1,rejectedId));
 await assert.rejects(put(target,"Changed rejected request",0,rejectedId));
 assert.equal((await readEntry(owner,target,fixture.diary)).content,"Exact");
});
test("256 KiB UTF-8 limit is enforced by API contract and database; empty clear retained",async()=>{
 const target="2026-11-08"; await put(target,"🌸".repeat(65536));
 await assert.rejects(put(target,"🌸".repeat(65537),1));
 await assert.rejects(fixture.diary.query("SELECT diary.write_entry($1,$2,$3,1,$4)",[fixtureOwner,target,"🌸".repeat(65537),randomUUID()]));
 await put(target,"",1); const entry=await readEntry(owner,target,fixture.diary);
 assert.equal(entry.exists,true); assert.equal(entry.content,""); assert.equal(entry.version,2);
});
test("functions use a fixed safe search path; RLS forced; direct duplicate rows are impossible",async()=>{
 const {rows}=await fixture.admin.query("SELECT p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='diary' AND p.proname IN ('read_entry','write_entry')");
 assert.equal(rows.length,2); for (const r of rows) { assert.equal(r.prosecdef,true); assert.deepEqual(r.proconfig,["search_path=pg_catalog, pg_temp"]); }
 const tables=await fixture.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='diary' AND c.relkind='r'");
 for (const row of tables.rows) { assert.equal(row.relrowsecurity,true); assert.equal(row.relforcerowsecurity,true); }
 await assert.rejects(fixture.admin.query("INSERT INTO diary.entries SELECT * FROM diary.entries LIMIT 1"));
 await fixture.diary.query("SET search_path=public"); assert.equal((await readEntry(owner,date,fixture.diary)).exists,true);
});
