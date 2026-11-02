import "server-only";
import { cache } from "react";
import { ownerResult } from "../auth/auth.server";
import { readPreferences } from "./repository.server";
import { defaultSnapshot,type PreferenceRead } from "./contracts";
// React cache is request-scoped RSC deduplication, never a process identity cache.
export const ownerPresentation=cache(async()=>{
 const access=await ownerResult();
 let preferences:PreferenceRead={kind:'loaded',preferences:defaultSnapshot()};
 if(access.kind==='owner')try{preferences={kind:'loaded',preferences:await readPreferences(access.owner)};}catch{preferences={kind:'failed',code:'unavailable'};}
 return {access,preferences};
});
