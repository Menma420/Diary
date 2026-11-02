import { requireOwner } from "@/lib/auth/auth.server";
import { OwnerAccessError } from "@/lib/auth/owner";
import { privateJson } from "@/lib/auth/http.server";
import { preferenceWriteSchema } from "@/lib/preferences/contracts";
import { readPreferences,writePreferences } from "@/lib/preferences/repository.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function failure(error:unknown) {
 if(error instanceof OwnerAccessError)return privateJson({error:"Owner access required"},error.kind==="anonymous"?401:error.kind==="forbidden"?403:503);
 if(error&&typeof error==="object"&&"code" in error&&error.code==="22023")return privateJson({error:"Invalid preferences mutation"},400);
 return privateJson({error:"Preferences unavailable"},503);
}
export async function GET(request:Request){try{return privateJson({kind:"loaded",preferences:await readPreferences(await requireOwner(request.headers))});}catch(error){return failure(error);}}
export async function PATCH(request:Request){try{
 await requireOwner(request.headers);
 if(request.headers.get("origin")!==process.env.APP_ORIGIN||request.headers.get("sec-fetch-site")==="cross-site")return privateJson({error:"Request origin rejected"},403);
 if(request.headers.get("content-type")?.split(";")[0]!=="application/json")return privateJson({error:"JSON required"},415);
 const reader=request.body?.getReader();let text="",size=0;
 if(reader){const decoder=new TextDecoder("utf-8",{fatal:true});try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();return privateJson({error:"Request too large"},413);}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}catch{return privateJson({error:"Invalid request"},400);}finally{reader.releaseLock();}}
 let body:unknown;try{body=JSON.parse(text);}catch{return privateJson({error:"Invalid request"},400);}
 const parsed=preferenceWriteSchema.safeParse(body);if(!parsed.success)return privateJson({error:"Invalid preferences"},400);
 const result=await writePreferences(await requireOwner(request.headers),parsed.data);
 return privateJson(result,result.kind==="conflict"?409:200);
 }catch(error){return failure(error);}}
