import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startFixture,fixtureOwner } from '../../scripts/auth/fixture.mjs';
import { readPreferences,writePreferences } from '../../src/lib/preferences/repository.server.ts';
import { assertDiaryRuntime } from '../../src/lib/diary/repository.server.ts';
import { assertAuthRuntime } from '../../src/lib/auth/runtime-role.server.ts';
let f;const owner={ownerId:fixtureOwner,expiresAt:new Date(Date.now()+86400000).toISOString()};
before(async()=>{f=await startFixture();});after(async()=>{await f?.close();});
const write=(theme='dreamy-sky',baseVersion=0,mutationId=randomUUID(),timezone='Asia/Kolkata')=>writePreferences(owner,{theme,timezone,baseVersion,mutationId},f.diary);
test('missing preferences return approved version-zero defaults without inserting a row',async()=>{
 assert.deepEqual(await readPreferences(owner,f.diary),{theme:'sakura-pink',timezone:'Asia/Kolkata',version:0,lastMutationId:null,createdAt:null,updatedAt:null});
 assert.equal((await f.admin.query('SELECT * FROM diary.preferences')).rowCount,0);
});
test('runtime has only controlled access; effective direct/column/privileged grants fail closed',async()=>{
 await assertDiaryRuntime(f.diary);await assertAuthRuntime(f.runtime);
 await assert.rejects(assertDiaryRuntime(f.admin));await assert.rejects(assertDiaryRuntime(f.runtime));
 for(const sql of ['SELECT * FROM diary.preferences','UPDATE diary.preferences SET theme=\'dreamy-sky\'','SELECT * FROM diary.preference_mutations'])await assert.rejects(f.diary.query(sql));
 await f.admin.query('GRANT UPDATE(theme) ON diary.preferences TO diary_entry_runtime');try{await assert.rejects(assertDiaryRuntime(f.diary));}finally{await f.admin.query('REVOKE UPDATE(theme) ON diary.preferences FROM diary_entry_runtime');}
 await f.admin.query('GRANT EXECUTE ON FUNCTION diary.read_preferences(uuid) TO diary_auth_runtime');try{await assert.rejects(assertAuthRuntime(f.runtime));}finally{await f.admin.query('REVOKE EXECUTE ON FUNCTION diary.read_preferences(uuid) FROM diary_auth_runtime');}
});
test('unknown owner and absent singleton binding are rejected',async()=>{
 await assert.rejects(readPreferences({...owner,ownerId:randomUUID()},f.diary));
 await f.admin.query('DELETE FROM private.diary_owner');try{await assert.rejects(readPreferences(owner,f.diary));await assert.rejects(write());}finally{await f.admin.query("INSERT INTO private.diary_owner(owner_id,auth_user_id) VALUES($1,'fixture-owner')",[fixtureOwner]);}
});
test('concurrent first creation yields exactly one row and a conflict, independently of entries',async()=>{
 const results=await Promise.all([write(),write('lavender-dreams')]);assert.deepEqual(results.map(r=>r.kind).sort(),['acknowledged','conflict']);
 const {rows}=await f.admin.query('SELECT * FROM diary.preferences');assert.equal(rows.length,1);assert.equal(Number(rows[0].version),1);
 assert.equal((await f.admin.query('SELECT * FROM diary.entries')).rowCount,0);assert.equal((await f.admin.query('SELECT * FROM diary.mutations')).rowCount,0);
 await assert.rejects(f.admin.query('INSERT INTO diary.preferences SELECT * FROM diary.preferences'));
});
test('versions are atomic and exact parallel/historical retries retain their original acknowledgement',async()=>{
 const id=randomUUID().toUpperCase();const results=await Promise.all(Array.from({length:8},()=>write('vintage-journal',1,id,'America/New_York')));
 for(const result of results)assert.deepEqual(result,results[0]);assert.equal(results[0].acknowledgement.version,2);
 await write('sakura-pink',2);assert.deepEqual(await write('vintage-journal',1,id,'America/New_York'),results[0]);assert.equal((await readPreferences(owner,f.diary)).version,3);
 const conflict=await write('dreamy-sky',1);assert.equal(conflict.kind,'conflict');assert.equal(conflict.current.theme,'sakura-pink');
});
test('reusing committed or rejected mutation UUIDs with different fields/base is denied',async()=>{
 const id=randomUUID();await write('dreamy-sky',3,id);
 for(const [theme,base,tz]of [['lavender-dreams',3,'Asia/Kolkata'],['dreamy-sky',4,'Asia/Kolkata'],['dreamy-sky',3,'UTC']])await assert.rejects(write(theme,base,id,tz));
 const rejected=randomUUID();assert.equal((await write('vintage-journal',0,rejected)).kind,'conflict');await assert.rejects(write('vintage-journal',4,rejected));
 assert.equal((await readPreferences(owner,f.diary)).version,4);
});
test('invalid themes, IANA timezones, null/unsafe versions are rejected atomically at both boundaries',async()=>{
 for(const [theme,tz,base]of [['unknown','UTC',4],['sakura-pink','Not/A_Zone',4],['sakura-pink','+05:30',4],['sakura-pink','UTC',-1],['sakura-pink','UTC',9007199254740991]]){
  await assert.rejects(write(theme,base,randomUUID(),tz));
  await assert.rejects(f.diary.query('SELECT diary.write_preferences($1,$2,$3,$4,$5)',[fixtureOwner,theme,tz,base,randomUUID()]));
 }
 assert.equal((await readPreferences(owner,f.diary)).version,4);
 const {rows}=await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='diary' AND c.relname IN ('preferences','preference_mutations')");for(const row of rows){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);}
});
test('preference functions have fixed paths, non-login ownership and no PUBLIC execute',async()=>{
 const {rows}=await f.admin.query("SELECT p.proname,p.prosecdef,p.proconfig,r.rolname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='diary' AND p.proname IN ('read_preferences','write_preferences')");
 assert.equal(rows.length,2);for(const row of rows){assert.equal(row.prosecdef,true);assert.equal(row.rolname,'diary_data_owner');assert.deepEqual(row.proconfig,['search_path=pg_catalog, pg_temp']);}
 await f.diary.query('SET search_path=public');assert.equal((await readPreferences(owner,f.diary)).version,4);
});

test('legacy unsupported theme reads use Sakura with real version and explicit safe repair',async()=>{
 await f.admin.query('ALTER TABLE diary.preferences DROP CONSTRAINT preferences_theme_check');
 try{
  await f.admin.query("UPDATE diary.preferences SET theme='unsupported-legacy'");
  assert.deepEqual(await readPreferences(owner,f.diary),{...(await readPreferences(owner,f.diary)),theme:'sakura-pink',version:4,repairRequired:true});
  assert.equal((await write('sakura-pink',4)).kind,'acknowledged');assert.equal((await readPreferences(owner,f.diary)).version,5);assert.equal((await readPreferences(owner,f.diary)).repairRequired,undefined);
 }finally{await f.admin.query("ALTER TABLE diary.preferences ADD CONSTRAINT preferences_theme_check CHECK(theme IN ('sakura-pink','dreamy-sky','lavender-dreams','vintage-journal'))");}
});
