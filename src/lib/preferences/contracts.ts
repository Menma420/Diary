import { z } from "zod";
import { themeIdSchema } from "../../themes/theme-id.ts";
import { timezoneSchema } from "../env-schema.ts";
z.config({ jitless: true });
export const preferenceValuesSchema=z.strictObject({
 theme:themeIdSchema,
 timezone:z.string().max(100).pipe(timezoneSchema),
});
export type PreferenceValues=z.infer<typeof preferenceValuesSchema>;
export const DEFAULT_PREFERENCES: Readonly<PreferenceValues>=Object.freeze({theme:"sakura-pink",timezone:"Asia/Kolkata"});
const version=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const preferenceWriteSchema=preferenceValuesSchema.extend({baseVersion:version.refine(v=>v<Number.MAX_SAFE_INTEGER),mutationId:z.uuid()}).readonly();
export type PreferenceWrite=z.infer<typeof preferenceWriteSchema>;
export const preferenceSnapshotSchema=preferenceValuesSchema.extend({version,repairRequired:z.literal(true).optional(),lastMutationId:z.uuid().nullable(),createdAt:z.iso.datetime().nullable(),updatedAt:z.iso.datetime().nullable()}).refine(s=>s.version===0 ? s.lastMutationId===null&&s.createdAt===null&&s.updatedAt===null : s.lastMutationId!==null&&s.createdAt!==null&&s.updatedAt!==null).readonly();
export type PreferenceSnapshot=z.infer<typeof preferenceSnapshotSchema>;
export const defaultSnapshot=(): PreferenceSnapshot=>({...DEFAULT_PREFERENCES,version:0,lastMutationId:null,createdAt:null,updatedAt:null});
export const preferenceAckSchema=z.strictObject({version,mutationId:z.uuid(),updatedAt:z.iso.datetime()});
export type PreferenceAck=z.infer<typeof preferenceAckSchema>;
export function preferenceAck(request:PreferenceWrite,input:unknown) {
 const ack=preferenceAckSchema.parse(input);
 if(ack.version!==request.baseVersion+1||ack.mutationId.toLowerCase()!==request.mutationId.toLowerCase())throw Error("Invalid preference acknowledgement");
 return ack;
}
export type PreferenceFailure={kind:"failed";code:"unavailable"|"invalid"|"unauthenticated"|"forbidden"};
export type PreferenceRead={kind:"loaded";preferences:PreferenceSnapshot}|PreferenceFailure;
export type PreferenceResult={kind:"acknowledged";acknowledgement:PreferenceAck}|{kind:"conflict";current:PreferenceSnapshot}|PreferenceFailure;
export interface PreferencesTransport { read():Promise<PreferenceRead>; write(request:PreferenceWrite):Promise<PreferenceResult>; }

// Preserve the real version/metadata for an explicit, CAS-protected repair.
// Only an unsupported stored theme is recoverable this way; invalid timezone,
// identity fields or receipt metadata remain a failed read.
export function parseStoredPreferences(input:unknown):PreferenceSnapshot {
 if(input&&typeof input==='object'&&'theme' in input&&typeof input.theme==='string'&&!themeIdSchema.safeParse(input.theme).success)
  return preferenceSnapshotSchema.parse({...input,theme:'sakura-pink',repairRequired:true});
 return preferenceSnapshotSchema.parse(input);
}
