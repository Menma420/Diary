import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorWorkspace,EditorController } from "@/lib/diary/editor-workspace";
import { SaveController } from "@/lib/diary/save-controller";
import { parseCalendarDate,type CalendarDate } from "@/lib/dates";
import type { Acknowledgement,EntryPersistence,EntrySnapshot,EntryWrite,EntryWriteResult,MutationSnapshot,RecoveryKey,RecoveryRecord,RecoveryResult,RecoveryStorage } from "@/lib/diary/persistence-contracts";
const a=parseCalendarDate("2026-11-01")!, b=parseCalendarDate("2026-11-02")!;
const scope="w1_"+"a".repeat(43), writer="11111111-1111-4111-8111-111111111111";
const missing=(date: CalendarDate): EntrySnapshot=>({exists:false,date,content:"",version:0});
const timestamp=()=>new Date().toISOString();
class Recovery implements RecoveryStorage {
 records=new Map<string,RecoveryRecord>(); fail=false; commits: RecoveryRecord[]=[];
 key=(key: RecoveryKey)=>JSON.stringify(key);
 async readOwner(workspaceId: string): Promise<RecoveryResult<readonly RecoveryRecord[]>> {return this.fail ? {ok:false,reason:"quota"} : {ok:true,value:[...this.records.values()].filter(r=>r.key.workspaceId===workspaceId)};}
 async commit(record: RecoveryRecord): Promise<RecoveryResult<void>> {this.commits.push(structuredClone(record)); if(this.fail)return {ok:false,reason:"quota"}; this.records.set(this.key(record.key),structuredClone(record));return {ok:true,value:undefined};}
 async acknowledge(key: RecoveryKey,mutation: MutationSnapshot,ack: Acknowledgement): Promise<RecoveryResult<void>> {
 if(this.fail)return {ok:false,reason:"quota"}; const stored=this.records.get(this.key(key));
 if(!stored||stored.pending?.request.mutationId!==mutation.request.mutationId)return {ok:false,reason:"stale"};
 if(stored.revision===mutation.revision)this.records.delete(this.key(key));else this.records.set(this.key(key),{...stored,pending:null,baseVersion:ack.version});return {ok:true,value:undefined};}
 async discard(record: RecoveryRecord): Promise<RecoveryResult<void>> { if(this.fail)return {ok:false,reason:"transaction"};this.records.delete(this.key(record.key));return {ok:true,value:undefined}; }
}
class Entries implements EntryPersistence {
 values=new Map<CalendarDate,EntrySnapshot>(); calls: {date: CalendarDate;request: EntryWrite}[]=[]; fail=false; failRead=false;
 barrier: Promise<void> | undefined; committed: (()=>void) | undefined;
 ledger=new Map<string,EntryWriteResult>();
 async read(date: CalendarDate) {return this.failRead ? {kind:"failed" as const,error:{code:"unavailable" as const,retryable:true}} : {kind:"loaded" as const,entry:this.values.get(date)??missing(date)};}
 async write(date: CalendarDate,request: EntryWrite): Promise<EntryWriteResult> {
 this.calls.push({date,request});
 if(this.fail)return {kind:"failed",error:{code:"unavailable",retryable:true}};
 const prior=this.ledger.get(request.mutationId);if(prior)return prior;
 const entry=this.values.get(date)??missing(date);
 if(entry.version!==request.baseVersion)return {kind:"conflict",current:entry};
 const acknowledgement={date,version:entry.version+1,mutationId:request.mutationId,updatedAt:timestamp()};
 this.values.set(date,{exists:true,date,content:request.content,version:acknowledgement.version,lastMutationId:request.mutationId,updatedAt:acknowledgement.updatedAt});
 const result={kind:"acknowledged" as const,acknowledgement};this.ledger.set(request.mutationId,result);this.committed?.();await this.barrier;return result;
 }
}
const instances: SaveController[]=[];
beforeEach(()=>{ vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-02T00:00:00Z")); });
afterEach(()=>{for(const c of instances)c.stop();instances.length=0;vi.useRealTimers();});
async function setup(recovery=new Recovery(),entries=new Entries()) {
 const workspace=new EditorWorkspace(), lock=vi.fn();const saves=new SaveController(workspace,scope,writer,entries,recovery,lock);instances.push(saves);
 await saves.open(a);const editor=new EditorController(workspace,a);editor.connect();
 const type=(content: string,c=editor)=>c.dispatch({type:"input",content,selection:{start:content.length,end:content.length,direction:"none"}});
 return {workspace,saves,entries,recovery,editor,type,lock};
}
it("loads missing dates before editing and distinguishes read failure from absence",async()=>{
 const {saves,workspace}=await setup();expect(saves.snapshot(a).phase).toBe("unchanged");expect(workspace.get(a).document).toBeNull();
 const entries=new Entries();entries.failRead=true;const failed=await setup(new Recovery(),entries);expect(failed.saves.snapshot(a).phase).toBe("load-failed");
});
it("1000ms inactivity debounce captures recovery and immutable mutation before dispatch",async()=>{
 const {type,saves,entries,recovery}=await setup();type("Exact 🌸");await vi.advanceTimersByTimeAsync(999);expect(entries.calls).toHaveLength(0);expect(recovery.records.size).toBe(1);
 await vi.advanceTimersByTimeAsync(1);expect(entries.calls).toHaveLength(1);expect(Object.isFrozen(entries.calls[0]!.request)).toBe(true);
 expect(recovery.commits.some(r=>r.pending?.request===entries.calls[0]!.request || r.pending?.request.content==="Exact 🌸")).toBe(true);
 expect(saves.snapshot(a).phase).toBe("saved");expect(recovery.records.size).toBe(0);
});
it("continuous input dispatches by 5000ms maximum wait",async()=>{
 const {type,entries}=await setup();type("0");for(let n=1;n<=5;n++){await vi.advanceTimersByTimeAsync(900);type(String(n));}
 expect(entries.calls).toHaveLength(0);await vi.advanceTimersByTimeAsync(500);expect(entries.calls).toHaveLength(1);expect(entries.calls[0]!.request.content).toBe("5");
});
it("IME holds dispatch then resumes without losing composition text",async()=>{
 const {type,editor,entries}=await setup();editor.dispatch({type:"composition",phase:"composing"});type("に");await vi.advanceTimersByTimeAsync(6000);expect(entries.calls).toHaveLength(0);
 type("日本");editor.dispatch({type:"composition",phase:"idle"});await vi.advanceTimersByTimeAsync(1000);expect(entries.calls[0]?.request.content).toBe("日本");
});
it("newer typing during in-flight acknowledgement remains unsaved and locally retained",async()=>{
 const {type,entries,saves,recovery,workspace}=await setup();let release!:()=>void;entries.barrier=new Promise(r=>release=r);
 type("First");await vi.advanceTimersByTimeAsync(1000);type("Newer");await vi.advanceTimersByTimeAsync(500);expect(entries.calls).toHaveLength(1);
 release();await vi.advanceTimersByTimeAsync(0);expect(workspace.get(a).document?.content).toBe("Newer");expect(saves.snapshot(a).phase).toBe("unsaved");
 const record=[...recovery.records.values()][0]!;expect(record.content).toBe("Newer");expect(record.pending).toBeNull();expect(record.baseVersion).toBe(1);
 entries.barrier=undefined;await vi.advanceTimersByTimeAsync(1000);expect(entries.values.get(a)?.content).toBe("Newer");expect(entries.values.get(a)?.version).toBe(2);expect(recovery.records.size).toBe(0);
});
it("acknowledgement for A cannot alter B; outgoing saves continue independently",async()=>{
 const {type,entries,saves,workspace}=await setup();let release!:()=>void;entries.barrier=new Promise(r=>release=r);type("A");await vi.advanceTimersByTimeAsync(1000);
 await saves.open(b);const editorB=new EditorController(workspace,b);editorB.connect();type("B",editorB);await vi.advanceTimersByTimeAsync(1000);
 expect(entries.calls.map(c=>c.date)).toEqual([a,b]);release();await vi.advanceTimersByTimeAsync(0);expect(workspace.get(b).document?.content).toBe("B");expect(saves.snapshot(b).phase).toBe("saved");
});
it("failed uncertain writes retry exact identity and snapshot while retaining newer text",async()=>{
 const {type,entries,saves}=await setup();entries.fail=true;type("Original");await vi.advanceTimersByTimeAsync(1000);const first=entries.calls[0]!;
 type("Newer");expect(saves.snapshot(a).phase).toBe("unsaved");entries.fail=false;saves.retry(a);await vi.advanceTimersByTimeAsync(0);
 expect(entries.calls[1]?.request).toEqual(first.request);expect(entries.calls[1]?.request.mutationId).toBe(first.request.mutationId);expect(saves.snapshot(a).phase).toBe("unsaved");
 await vi.advanceTimersByTimeAsync(1000);expect(entries.values.get(a)?.content).toBe("Newer");
});
it("clear persists an empty row rather than deleting a date",async()=>{
 const {type,editor,entries}=await setup();type("Text");await vi.advanceTimersByTimeAsync(1000);editor.dispatch({type:"clear"});await vi.advanceTimersByTimeAsync(1000);
 expect(entries.values.get(a)).toMatchObject({exists:true,content:"",version:2});
});
it("position and theme-neutral rerenders do not create writes after acknowledgement",async()=>{
 const {type,editor,entries}=await setup();type("Text");await vi.advanceTimersByTimeAsync(1000);editor.dispatch({type:"position",selection:{start:1,end:2,direction:"backward"},scrollY:400});await vi.advanceTimersByTimeAsync(2000);expect(entries.calls).toHaveLength(1);
});
it("conflicts preserve local and server content until deliberate version-checked resolution",async()=>{
 const {type,entries,saves,recovery,workspace}=await setup();await entries.write(a,{content:"Other device",baseVersion:0,mutationId:crypto.randomUUID()});type("My draft");await vi.advanceTimersByTimeAsync(1000);
 expect(saves.snapshot(a).phase).toBe("conflict");expect(saves.snapshot(a).current?.content).toBe("Other device");expect([...recovery.records.values()][0]?.content).toBe("My draft");
 await saves.resolve(a,saves.snapshot(a).alternatives[0]!);expect(entries.values.get(a)).toMatchObject({content:"My draft",version:2});expect(workspace.get(a).document?.content).toBe("My draft");expect(recovery.records.size).toBe(0);
});
it("recovery enumerates all dates/writers and different workspace scopes remain excluded",async()=>{
 const recovery=new Recovery();for(const [date,writerId] of [[a,crypto.randomUUID()],[b,crypto.randomUUID()]] as const) await recovery.commit({schemaVersion:1,key:{workspaceId:scope,date,writerId},content:date,revision:1,baseVersion:0,pending:null,updatedAt:timestamp()});
 await recovery.commit({schemaVersion:1,key:{workspaceId:"w1_"+"b".repeat(43),date:a,writerId:crypto.randomUUID()},content:"Other identity",revision:1,baseVersion:0,pending:null,updatedAt:timestamp()});
 const {entries,saves}=await setup(recovery);await vi.advanceTimersByTimeAsync(1000);expect(entries.values.get(a)?.content).toBe(a);expect(entries.values.get(b)?.content).toBe(b);expect(saves.dates()).toContain(b);expect(recovery.records.size).toBe(1);
});
it("multiple writers for one date require a choice and never select a timestamp winner",async()=>{
 const recovery=new Recovery();for(const content of ["Writer A","Writer B"]) await recovery.commit({schemaVersion:1,key:{workspaceId:scope,date:a,writerId:crypto.randomUUID()},content,revision:1,baseVersion:0,pending:null,updatedAt:timestamp()});
 const {saves,entries}=await setup(recovery);await vi.advanceTimersByTimeAsync(6000);expect(saves.snapshot(a).phase).toBe("conflict");expect(saves.snapshot(a).alternatives).toHaveLength(2);expect(entries.calls).toHaveLength(0);expect(recovery.records.size).toBe(2);
});
it("quota failure visibly preserves memory while server saving remains available",async()=>{
 const recovery=new Recovery();recovery.fail=true;const {type,saves,entries,workspace}=await setup(recovery);type("Retain me");await vi.advanceTimersByTimeAsync(0);expect(saves.snapshot(a).recovery).toBe("unavailable");expect(saves.snapshot(a).durable).toBe(false);
 await vi.advanceTimersByTimeAsync(1000);expect(entries.values.get(a)?.content).toBe("Retain me");expect(saves.snapshot(a).phase).toBe("saved");expect(saves.snapshot(a).recovery).toBe("unavailable");expect(workspace.get(a).document?.content).toBe("Retain me");
});
it("paused sessions capture drafts but do not write until fresh-server reconciliation",async()=>{
 const {type,saves,entries,recovery}=await setup();type("Writing");saves.setPaused(true);await vi.advanceTimersByTimeAsync(6000);expect(entries.calls).toHaveLength(0);expect(recovery.records.size).toBe(1);
 await saves.resume();await vi.advanceTimersByTimeAsync(1000);expect(entries.values.get(a)?.content).toBe("Writing");
});
it("failed logout flush preserves unresolved memory and exact pending metadata",async()=>{
 const {type,saves,entries,recovery}=await setup();entries.fail=true;type("Unresolved");expect(await saves.flush()).toBe(false);expect(recovery.records.size).toBe(1);expect([...recovery.records.values()][0]?.pending?.request.content).toBe("Unresolved");
});
it("oversized local writing is retained for recovery without sending an invalid mutation",async()=>{
 const {type,saves,entries,recovery}=await setup();const content="🌸".repeat(65537);type(content);await vi.advanceTimersByTimeAsync(1000);expect(entries.calls).toHaveLength(0);expect(saves.snapshot(a).phase).toBe("save-failed");expect([...recovery.records.values()][0]?.content).toBe(content);
});
it("reauthentication discovers every writer before resuming saves for newly recovered dates",async()=>{
 const {saves,recovery,entries}=await setup();saves.setPaused(true);
 for(const content of ["New writer A","New writer B"])await recovery.commit({schemaVersion:1,key:{workspaceId:scope,date:b,writerId:crypto.randomUUID()},content,revision:1,baseVersion:0,pending:null,updatedAt:timestamp()});
 await saves.resume();await vi.advanceTimersByTimeAsync(6000);expect(saves.snapshot(b).phase).toBe("conflict");expect(saves.snapshot(b).alternatives.map(r=>r.content)).toEqual(["New writer A","New writer B"]);expect(entries.calls).toHaveLength(0);expect(recovery.records.size).toBe(2);
});
it("maximum-wait debt is not reset by an older in-flight acknowledgement",async()=>{
 const {type,entries}=await setup();let release!:()=>void;entries.barrier=new Promise(r=>release=r);type("Snapshot");await vi.advanceTimersByTimeAsync(1000);
 type("Newer");await vi.advanceTimersByTimeAsync(6000);expect(entries.calls).toHaveLength(1);release();await vi.advanceTimersByTimeAsync(1);expect(entries.calls).toHaveLength(2);expect(entries.calls[1]?.request.content).toBe("Newer");
});
it("a read failure on reauthentication can be retried and never becomes a blank editable load",async()=>{
 const {saves,entries,workspace}=await setup();entries.failRead=true;await saves.resume();expect(saves.snapshot(a).phase).toBe("load-failed");
 entries.failRead=false;saves.retry(a);await vi.advanceTimersByTimeAsync(0);expect(saves.snapshot(a).phase).toBe("unchanged");expect(workspace.get(a).document).toBeNull();
});
it("invalid acknowledgements retain exact pending metadata and cannot report Saved",async()=>{
 const {saves,entries,recovery,type}=await setup();const write=entries.write.bind(entries);entries.write=async(date,request)=>{const result=await write(date,request);return result.kind==="acknowledged"?{...result,acknowledgement:{...result.acknowledgement,date:b}}:result;};
 type("Keep pending");await vi.advanceTimersByTimeAsync(1000);expect(saves.snapshot(a).phase).toBe("save-failed");expect([...recovery.records.values()][0]?.pending?.request.content).toBe("Keep pending");
});
it("wall-clock changes cannot extend the maximum wait during continued input",async()=>{
 const {type,entries}=await setup();type("Start");vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
 for(let n=1;n<=5;n++){await vi.advanceTimersByTimeAsync(900);type(`Changed ${n}`);}
 await vi.advanceTimersByTimeAsync(500);expect(entries.calls).toHaveLength(1);expect(entries.calls[0]?.request.content).toBe("Changed 5");
});
it("reauthentication surfaces this writer's retained record after a cleanup failure instead of silently skipping it",async()=>{
 const {type,saves,recovery,entries}=await setup();const acknowledge=recovery.acknowledge.bind(recovery);
 recovery.acknowledge=async()=>({ok:false,reason:"transaction"});type("Server confirmed, cleanup failed");await vi.advanceTimersByTimeAsync(1000);
 expect(saves.snapshot(a).phase).toBe("saved");expect(recovery.records.size).toBe(1);recovery.acknowledge=acknowledge;
 await saves.resume();expect(saves.snapshot(a).phase).toBe("conflict");expect(saves.snapshot(a).alternatives[0]?.content).toBe("Server confirmed, cleanup failed");
 await saves.resolve(a,"server");expect(recovery.records.size).toBe(0);expect(entries.values.get(a)?.version).toBe(1);
});
it("acknowledgement cannot retire an unrelated writer discovered while the request was in flight",async()=>{
 const {type,saves,entries,recovery}=await setup();let release!:()=>void;entries.barrier=new Promise(r=>release=r);
 type("Current writer");await vi.advanceTimersByTimeAsync(1000);
 const other:RecoveryRecord={schemaVersion:1,key:{workspaceId:scope,date:a,writerId:crypto.randomUUID()},content:"Unrelated unresolved writer",revision:1,baseVersion:0,pending:null,updatedAt:timestamp()};await recovery.commit(other);
 saves.setPaused(true);await saves.resume();expect(saves.snapshot(a).phase).toBe("conflict");release();await vi.advanceTimersByTimeAsync(0);
 expect(saves.snapshot(a).phase).toBe("conflict");expect([...recovery.records.values()].map(r=>r.content)).toContain("Unrelated unresolved writer");expect(entries.values.get(a)?.content).toBe("Current writer");
});
it("historical mutation acknowledgements do not mark an advanced server entry as the current Saved version",async()=>{
 const {type,saves,entries,recovery}=await setup();const write=entries.write.bind(entries);let drop=true;
 entries.write=async(date,request)=>{const result=await write(date,request);if(drop){drop=false;return {kind:"failed",error:{code:"unavailable",retryable:true}};}return result;};
 type("Older local writing");await vi.advanceTimersByTimeAsync(1000);const pending=[...recovery.records.values()][0]!.pending!;
 await entries.write(a,{content:"Another device advanced",baseVersion:1,mutationId:crypto.randomUUID()});saves.retry(a);await vi.advanceTimersByTimeAsync(0);
 expect(saves.snapshot(a).phase).toBe("conflict");expect(saves.snapshot(a).current?.content).toBe("Another device advanced");expect([...recovery.records.values()][0]?.pending).toEqual(pending);expect(entries.values.get(a)?.version).toBe(2);
});
it("server choices and recovered acknowledgements never reset the writer's monotonic revision",async()=>{
 const {type,saves,entries,workspace}=await setup();await entries.write(a,{content:"Remote",baseVersion:0,mutationId:crypto.randomUUID()});type("Local");await vi.advanceTimersByTimeAsync(1000);
 const previous=workspace.get(a).revision;await saves.resolve(a,"server");expect(workspace.get(a).revision).toBeGreaterThan(previous);type("After resolution");await vi.advanceTimersByTimeAsync(1000);expect(entries.values.get(a)).toMatchObject({content:"After resolution",version:2});
 const recordRevision=workspace.get(a).revision;workspace.hydrate(a,{date:a,content:"Fresh read"});expect(workspace.get(a).revision).toBe(recordRevision);
});
it("recovered newer text resumes after its older pending snapshot is acknowledged without conflicting with its own source copy",async()=>{
 const entries=new Entries(),recovery=new Recovery(),mutationId=crypto.randomUUID();await entries.write(a,{content:"Older snapshot",baseVersion:0,mutationId});
 await recovery.commit({schemaVersion:1,key:{workspaceId:scope,date:a,writerId:crypto.randomUUID()},content:"Newer recovered writing",revision:2,baseVersion:0,updatedAt:timestamp(),pending:{date:a,revision:1,request:{content:"Older snapshot",baseVersion:0,mutationId}}});
 const {saves,workspace}=await setup(recovery,entries);expect(saves.snapshot(a).phase).toBe("unsaved");expect(workspace.get(a).document?.content).toBe("Newer recovered writing");
 await vi.advanceTimersByTimeAsync(1000);expect(saves.snapshot(a).phase).toBe("saved");expect(entries.values.get(a)).toMatchObject({content:"Newer recovered writing",version:2});expect(recovery.records.size).toBe(0);
});
it("a failed post-acknowledgement device commit cannot certify newer text as locally durable",async()=>{
 const {type,saves,entries,recovery,workspace}=await setup();const commit=recovery.commit.bind(recovery);
 recovery.commit=async(record)=>record.key.date===a && record.baseVersion===1 && record.pending===null ? {ok:false,reason:"quota"} : commit(record);
 let release!:()=>void;entries.barrier=new Promise(r=>release=r);type("Older");await vi.advanceTimersByTimeAsync(1000);type("Newer");release();await vi.advanceTimersByTimeAsync(0);
 expect(saves.snapshot(a).phase).toBe("unsaved");expect(saves.snapshot(a).durable).toBe(false);
 await saves.open(b);const editorB=new EditorController(workspace,b);editorB.connect();type("Another date",editorB);await vi.advanceTimersByTimeAsync(0);
 expect(saves.snapshot(a).durable).toBe(false);expect(workspace.get(a).document?.content).toBe("Newer");
});
