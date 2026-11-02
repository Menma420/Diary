import { expect,it } from 'vitest';
import { PreferenceController } from '@/lib/preferences/controller';
import { defaultSnapshot,parseStoredPreferences,preferenceValuesSchema,preferenceWriteSchema,preferenceAck,type PreferenceSnapshot,type PreferenceWrite,type PreferenceResult,type PreferencesTransport,type PreferenceRead } from '@/lib/preferences/contracts';
class Transport implements PreferencesTransport {
 current=defaultSnapshot();calls:PreferenceWrite[]=[];fail=false;drop=false;barrier:Promise<void>|undefined;reads:Promise<void>|undefined;
 receipts=new Map<string,PreferenceResult>();
 async read():Promise<PreferenceRead>{await this.reads;return {kind:'loaded' as const,preferences:this.current};}
 async write(request:PreferenceWrite):Promise<PreferenceResult>{this.calls.push(request);if(this.fail)return {kind:'failed',code:'unavailable'};
  const old=this.receipts.get(request.mutationId);if(old)return old;
  if(request.baseVersion!==this.current.version)return {kind:'conflict',current:this.current};
  const acknowledgement={version:request.baseVersion+1,mutationId:request.mutationId,updatedAt:new Date().toISOString()};
  this.current={theme:request.theme,timezone:request.timezone,version:acknowledgement.version,lastMutationId:request.mutationId,createdAt:this.current.createdAt??acknowledgement.updatedAt,updatedAt:acknowledgement.updatedAt};
  const result={kind:'acknowledged' as const,acknowledgement};this.receipts.set(request.mutationId,result);await this.barrier;
  if(this.drop){this.drop=false;return {kind:'failed',code:'unavailable'};}return result;
 }
}
const values=(theme:PreferenceSnapshot['theme'])=>({theme,timezone:'Asia/Kolkata'});
const settle=async()=>{for(let n=0;n<15;n++)await Promise.resolve();};
function setup(){const transport=new Transport();const controller=new PreferenceController({kind:'loaded',preferences:defaultSnapshot()},transport);return {controller,transport};}
it('validates exactly four themes and IANA zones without ownership fields',()=>{
 expect(defaultSnapshot()).toMatchObject({theme:'sakura-pink',timezone:'Asia/Kolkata',version:0});
 for(const theme of ['sakura-pink','dreamy-sky','lavender-dreams','vintage-journal'])expect(preferenceValuesSchema.safeParse(values(theme as PreferenceSnapshot['theme'])).success).toBe(true);
 for(const timezone of ['Asia/Kolkata','UTC','Pacific/Kiritimati','America/New_York'])expect(preferenceValuesSchema.safeParse({theme:'sakura-pink',timezone}).success).toBe(true);
 for(const timezone of ['Not/AZone','+05:30','UTC;DROP TABLE diary.preferences',''])expect(preferenceValuesSchema.safeParse({theme:'sakura-pink',timezone}).success).toBe(false);
 expect(preferenceValuesSchema.safeParse({...values('sakura-pink'),theme:'new-theme'}).success).toBe(false);
 expect(preferenceWriteSchema.safeParse({...values('sakura-pink'),baseVersion:0,mutationId:crypto.randomUUID(),ownerId:crypto.randomUUID()}).success).toBe(false);
});
it('applies immediate selections, serializes requests and never lets an older acknowledgement revert the latest choice',async()=>{
 const {controller,transport}=setup();let release!:()=>void;transport.barrier=new Promise(r=>release=r);
 controller.choose(values('dreamy-sky'));controller.choose(values('lavender-dreams'));expect(controller.snapshot().values.theme).toBe('lavender-dreams');expect(transport.calls).toHaveLength(1);expect(Object.isFrozen(transport.calls[0])).toBe(true);
 release();await settle();expect(controller.snapshot()).toMatchObject({status:'saved',values:{theme:'lavender-dreams'},server:{version:2}});expect(transport.calls).toHaveLength(2);
});
it('retains exact uncertain mutations for retries and preserves newer selections',async()=>{
 const {controller,transport}=setup();transport.drop=true;controller.choose(values('dreamy-sky'));await settle();expect(controller.snapshot().status).toBe('failed');const first=transport.calls[0];
 controller.choose(values('vintage-journal'));expect(controller.snapshot().status).toBe('failed');await controller.retry();await settle();expect(transport.calls[1]).toEqual(first);expect(controller.snapshot()).toMatchObject({values:{theme:'vintage-journal'},status:'saved',server:{version:2}});
});
it('historical receipts after another session advances become an explicit conflict',async()=>{
 const {controller,transport}=setup();transport.drop=true;controller.choose(values('dreamy-sky'));await settle();
 await transport.write({...values('lavender-dreams'),baseVersion:1,mutationId:crypto.randomUUID()});await controller.retry();
 expect(controller.snapshot()).toMatchObject({status:'conflict',values:{theme:'dreamy-sky'},current:{theme:'lavender-dreams'}});
 await controller.resolve('local');expect(controller.snapshot()).toMatchObject({status:'saved',server:{version:3},values:{theme:'dreamy-sky'}});
});
it('stale initial and focus reads cannot replace a newer deliberate selection',async()=>{
 const {controller,transport}=setup();let release!:()=>void;let reads=0;const snapshot=transport.current;transport.read=async()=>{if(++reads===1){await new Promise<void>(r=>release=r);return {kind:'loaded',preferences:snapshot};}return {kind:'loaded',preferences:transport.current};};
 const read=controller.revalidate();controller.choose(values('vintage-journal'));release();await read;expect(controller.snapshot().values.theme).toBe('vintage-journal');
});
it('a conflict choice checks fresh versions and keeps choices on a second server advance',async()=>{
 const {controller,transport}=setup();await transport.write({...values('dreamy-sky'),baseVersion:0,mutationId:crypto.randomUUID()});controller.choose(values('vintage-journal'));await settle();expect(controller.snapshot().status).toBe('conflict');
 await transport.write({...values('lavender-dreams'),baseVersion:1,mutationId:crypto.randomUUID()});await controller.resolve('server');expect(controller.snapshot()).toMatchObject({status:'conflict',values:{theme:'vintage-journal'},current:{version:2}});
 await controller.resolve('server');expect(controller.snapshot()).toMatchObject({status:'unchanged',values:{theme:'lavender-dreams'}});
});
it('failed writes never claim saved and a paused session retains choices without dispatch',async()=>{
 const {controller,transport}=setup();controller.setPaused(true);controller.choose(values('dreamy-sky'));expect(transport.calls).toHaveLength(0);
 transport.fail=true;await controller.resume();expect(controller.snapshot().status).toBe('failed');expect(controller.snapshot().values.theme).toBe('dreamy-sky');
 transport.fail=false;await controller.retry();expect(controller.snapshot().status).toBe('saved');
});
it('authentication denial locks the owner boundary without resetting selected appearance',async()=>{
 const transport=new Transport();let locks=0;transport.write=async()=>({kind:'failed',code:'unauthenticated'});
 const controller=new PreferenceController({kind:'loaded',preferences:defaultSnapshot()},transport,()=>locks++);controller.choose(values('dreamy-sky'));await settle();expect(locks).toBe(1);expect(controller.snapshot()).toMatchObject({status:'failed',values:{theme:'dreamy-sky'}});
});
it('acknowledgements must match exact UUID and base version',()=>{
 const request={...values('dreamy-sky'),baseVersion:0,mutationId:crypto.randomUUID()};
 expect(()=>preferenceAck(request,{version:2,mutationId:request.mutationId,updatedAt:new Date().toISOString()})).toThrow();
 expect(()=>preferenceAck(request,{version:1,mutationId:crypto.randomUUID(),updatedAt:new Date().toISOString()})).toThrow();
});
it('a failed first read does not masquerade as saved defaults and retry loads authoritative values',async()=>{
 const transport=new Transport();transport.current={...transport.current,theme:'vintage-journal'};
 const controller=new PreferenceController({kind:'failed',code:'unavailable'},transport);expect(controller.snapshot()).toMatchObject({status:'loading',server:null});await controller.retry();expect(controller.snapshot()).toMatchObject({status:'unchanged',values:{theme:'vintage-journal'}});
});

it('an initial read outage can fail repeatedly and then recover without trapping the editor behind a conflict',async()=>{
 const transport=new Transport();let unavailable=true;
 transport.read=async()=>unavailable?{kind:'failed',code:'unavailable'}:{kind:'loaded',preferences:transport.current};
 const controller=new PreferenceController({kind:'failed',code:'unavailable'},transport);
 await controller.resume();expect(controller.snapshot()).toMatchObject({status:'failed',server:null});
 unavailable=false;await controller.retry();expect(controller.snapshot()).toMatchObject({status:'unchanged',server:{version:0}});
});

it('unsupported stored themes preview Sakura while retaining the actual version for explicit repair',()=>{
 const timestamp=new Date().toISOString(),stored={...defaultSnapshot(),version:3,lastMutationId:crypto.randomUUID(),createdAt:timestamp,updatedAt:timestamp,theme:'unsupported'};
 expect(parseStoredPreferences(stored)).toMatchObject({theme:'sakura-pink',version:3,repairRequired:true});
 expect(()=>parseStoredPreferences({...stored,timezone:'Invalid/Zone'})).toThrow();
});
it('repairing the fallback theme writes with the retained base even though the visible value matches',async()=>{
 const {transport}=setup();const timestamp=new Date().toISOString();transport.current={...defaultSnapshot(),version:1,lastMutationId:crypto.randomUUID(),createdAt:timestamp,updatedAt:timestamp,repairRequired:true};
 const controller=new PreferenceController({kind:'loaded',preferences:transport.current},transport);expect(controller.snapshot().status).toBe('repair');controller.choose(values('sakura-pink'));await settle();expect(controller.snapshot()).toMatchObject({status:'saved',server:{version:2}});expect(transport.calls[0]?.baseVersion).toBe(1);
});
