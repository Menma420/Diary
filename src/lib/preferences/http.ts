import { preferenceSnapshotSchema,preferenceAck,type PreferencesTransport,type PreferenceWrite,type PreferenceFailure } from "./contracts";
const failed=(status:number):PreferenceFailure=>({kind:"failed",code:status===401?"unauthenticated":status===403?"forbidden":status===400?"invalid":"unavailable"});
export class HttpPreferences implements PreferencesTransport {
 async read(){try{const response=await fetch('/api/preferences',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)return failed(response.status);return {kind:"loaded" as const,preferences:preferenceSnapshotSchema.parse((await response.json()).preferences)};}catch{return failed(503);}}
 async write(request:PreferenceWrite){try{
  const response=await fetch('/api/preferences',{method:'PATCH',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(15000)});
  if(!response.ok&&response.status!==409)return failed(response.status);const body=await response.json();
  return response.status===409?{kind:"conflict" as const,current:preferenceSnapshotSchema.parse(body.current)}:{kind:"acknowledged" as const,acknowledgement:preferenceAck(request,body.acknowledgement)};
 }catch{return failed(503);}}
}
