import { preferenceValuesSchema,preferenceAck,defaultSnapshot,type PreferenceValues,type PreferenceSnapshot,type PreferenceWrite,type PreferencesTransport,type PreferenceRead } from "./contracts";
export type PreferenceState=Readonly<{values:PreferenceValues;server:PreferenceSnapshot|null;status:"repair"|"loading"|"unchanged"|"saving"|"unsaved"|"saved"|"failed"|"conflict";current?:PreferenceSnapshot}>;
const pick=(v:PreferenceValues):PreferenceValues=>Object.freeze({theme:v.theme,timezone:v.timezone});
const equal=(a:PreferenceValues,b:PreferenceValues)=>a.theme===b.theme&&a.timezone===b.timezone;
// Separate from EditorWorkspace, entry mutations and IndexedDB. One exact unresolved
// request, with newer deliberate values retained independently until acknowledged.
export class PreferenceController {
 private state:PreferenceState;
 private listeners=new Set<()=>void>();private revision=0;private reads=0;
 private pending:{request:PreferenceWrite;revision:number}|null=null;
 private busy=false;private paused=false;
 constructor(initial:PreferenceRead,private transport:PreferencesTransport,private lock:()=>void=()=>{}){
  this.state=Object.freeze({values:pick(initial.kind==='loaded'?initial.preferences:defaultSnapshot()),server:initial.kind==='loaded'?initial.preferences:null,status:initial.kind==='loaded'?(initial.preferences.repairRequired?'repair':'unchanged'):'loading'});
 }
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 snapshot=()=>this.state;
 private update(changes:Partial<PreferenceState>){this.state=Object.freeze({...this.state,...changes});for(const listener of this.listeners)listener();}
 private denied(code:string){if(code==='unauthenticated'||code==='forbidden'){this.paused=true;this.lock();}}
 choose(input:PreferenceValues){const values=Object.freeze(preferenceValuesSchema.parse(input));this.revision++;this.reads++;
  this.update({values,status:this.state.status==='conflict'?'conflict':this.state.status==='failed'&&this.pending?'failed':'unsaved'});
  if(this.state.status!=='conflict'&&!this.pending)void this.send();
 }
 setPaused(paused:boolean){this.paused=paused;this.reads++;}
 async revalidate(){
  const generation=++this.reads,revision=this.revision;const result=await this.transport.read();
  if(generation!==this.reads||revision!==this.revision)return;
  if(result.kind==='failed'){this.denied(result.code);this.update({status:'failed'});return;}
  if(!this.state.server&&!this.pending){this.update({server:result.preferences,values:pick(result.preferences),status:result.preferences.repairRequired?'repair':'unchanged'});return;}
  if(this.state.server&&!this.pending&&equal(this.state.values,this.state.server)&&this.state.status!=='conflict'){if(result.preferences.version>=this.state.server.version)this.update({server:result.preferences,values:pick(result.preferences),status:result.preferences.repairRequired?'repair':'unchanged'});return;}
  if(this.pending||['unsaved','failed','saving','conflict'].includes(this.state.status)){
   if(this.state.status==='conflict'||(!this.pending&&result.preferences.version!==this.state.server?.version))this.update({status:'conflict',current:result.preferences});
   // Uncertain commits must retry their exact snapshot before adopting a new base.
  }else if(!this.state.server||result.preferences.version>=this.state.server.version)this.update({server:result.preferences,values:pick(result.preferences),status:result.preferences.repairRequired?'repair':'unchanged'});
 }
 async retry(){if(this.state.status==='conflict'||this.paused)return;if(!this.pending){await this.revalidate();if(this.state.server===null)return;}await this.send();}
 async resume(){this.paused=false;await this.revalidate();if(this.state.status!=='conflict'&&(this.pending||this.state.status==='unsaved'))await this.send();}
 private async send(){
  if(this.busy||this.paused||!this.state.server||this.state.status==='conflict')return;
  if(!this.pending){if(equal(this.state.values,this.state.server)&&!this.state.server.repairRequired){this.update({status:'unchanged'});return;}
   this.pending={request:Object.freeze({...this.state.values,baseVersion:this.state.server.version,mutationId:crypto.randomUUID()}),revision:this.revision};}
  const pending=this.pending;this.busy=true;this.update({status:'saving'});
  try{
   const result=await this.transport.write(pending.request);
   if(result.kind==='failed'){this.denied(result.code);this.update({status:'failed'});return;}
   if(result.kind==='conflict'){this.update({status:'conflict',current:result.current});return;}
   const ack=preferenceAck(pending.request,result.acknowledgement);
   // A receipt can be historical. Read authoritative state before claiming saved
   // or dispatching newer choices against the acknowledgement's base.
   const fresh=await this.transport.read();
   if(fresh.kind==='failed'){this.denied(fresh.code);this.update({status:'failed'});return;}
   if(fresh.preferences.version!==ack.version||fresh.preferences.lastMutationId?.toLowerCase()!==ack.mutationId.toLowerCase()||!equal(fresh.preferences,pending.request)){
    this.update({status:'conflict',current:fresh.preferences});return;
   }
   this.pending=null;this.update({server:fresh.preferences,status:this.revision===pending.revision?'saved':'unsaved'});
  }catch{this.update({status:'failed'});}finally{this.busy=false;}
  if(!this.paused&&this.state.status==='unsaved')await this.send();
 }
 async resolve(choice:'local'|'server'){
  if(this.busy||this.paused||this.state.status!=='conflict')return;
  const revision=this.revision,generation=++this.reads,current=this.state.current;
  const fresh=await this.transport.read();if(generation!==this.reads||revision!==this.revision)return;
  if(fresh.kind==='failed'){this.denied(fresh.code);return;}
  if(fresh.preferences.version!==current?.version){this.update({current:fresh.preferences});return;}
  this.pending=null;this.revision++;
  this.update({server:fresh.preferences,...(choice==='server'?{values:pick(fresh.preferences),status:fresh.preferences.repairRequired?'repair' as const:'unchanged' as const}:{status:'unsaved' as const}),current:undefined});
  if(choice==='local')await this.send();
 }
}
