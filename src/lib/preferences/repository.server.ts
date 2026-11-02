import "server-only";
import type { VerifiedOwner } from "../auth/owner";
import { diaryPool,assertDiaryRuntime } from "../diary/repository.server.ts";
import { parseStoredPreferences,preferenceWriteSchema,preferenceAck,type PreferenceWrite,type PreferenceResult } from "./contracts.ts";
export async function readPreferences(owner:VerifiedOwner,connection=diaryPool()) {
 await assertDiaryRuntime(connection);
 const {rows}=await connection.query("SELECT diary.read_preferences($1::uuid) AS result",[owner.ownerId]);
 return parseStoredPreferences(rows[0]?.result);
}
export async function writePreferences(owner:VerifiedOwner,input:PreferenceWrite,connection=diaryPool()):Promise<PreferenceResult> {
 const request=preferenceWriteSchema.parse(input);await assertDiaryRuntime(connection);
 const {rows}=await connection.query("SELECT diary.write_preferences($1::uuid,$2::text,$3::text,$4::bigint,$5::uuid) AS result",[owner.ownerId,request.theme,request.timezone,request.baseVersion,request.mutationId]);
 const result:unknown=rows[0]?.result;
 if(result&&typeof result==="object"&&"kind" in result){
  if(result.kind==="conflict"&&"current" in result)return {kind:"conflict",current:parseStoredPreferences(result.current)};
  if(result.kind==="acknowledged"&&"acknowledgement" in result)return {kind:"acknowledged",acknowledgement:preferenceAck(request,result.acknowledgement)};
 }
 throw Error("Invalid preferences response");
}
