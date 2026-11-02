import { expect,it } from "vitest";
import { parseCalendarDate,addDays } from "@/lib/dates";
import { selectDecorations } from "@/lib/decorations";
import { DECORATION_MANIFEST,decorationManifestSchema } from "@/lib/decoration-manifest";
const input={ownerScope:`w1_${"a".repeat(43)}`,date:parseCalendarDate("2026-10-31")!,theme:"sakura-pink" as const};
it("identical owner/date/theme/version inputs are immutable and deterministic across repeated renders",()=>{
 const first=selectDecorations(input);expect(first).toHaveLength(4);expect(Object.isFrozen(first)).toBe(true);
 for(let i=0;i<100;i++)expect(selectDecorations({...input,version:1})).toEqual(first);
});
it("varies corner assignments across 90 dates without requiring globally unique arrangements",()=>{
 const arrangements=new Set(Array.from({length:90},(_,i)=>JSON.stringify(selectDecorations({...input,date:addDays(input.date,i)!}).map(d=>d.asset.id))));
 expect(arrangements.size).toBeGreaterThanOrEqual(12);
 expect(selectDecorations({...input,ownerScope:`w1_${"b".repeat(43)}`})).not.toEqual(selectDecorations(input));
});
it("all four themes respect membership, unique assets, corner permissions and bounded rendering",()=>{
 for(const theme of ["sakura-pink","dreamy-sky","lavender-dreams","vintage-journal"] as const)for(let i=0;i<60;i++){
  const result=selectDecorations({...input,theme,date:addDays(input.date,i)!});expect(result).toHaveLength(4);expect(new Set(result.map(d=>d.asset.id)).size).toBe(4);expect(new Set(result.map(d=>d.corner)).size).toBe(4);
  for(const d of result){expect(d.asset.themes).toContain(theme);expect(d.asset.corners).toContain(d.corner);expect(d.sizePercent).toBeGreaterThanOrEqual(d.asset.sizePercent.min);expect(d.sizePercent).toBeLessThanOrEqual(d.asset.sizePercent.max);expect(d.rotation).toBeGreaterThanOrEqual(d.asset.rotation.min);expect(d.rotation).toBeLessThanOrEqual(d.asset.rotation.max);}
 }
});
it("manifest reordering and unrelated additions cannot reshuffle launch arrangements",()=>{
 const extra={...DECORATION_MANIFEST.assets[0]!,id:"future-unselected-asset",path:"/decorations/v2/future-unselected-asset.svg"};
 expect(selectDecorations(input,{...DECORATION_MANIFEST,assets:[extra,...DECORATION_MANIFEST.assets.toReversed()]})).toEqual(selectDecorations(input));
});
it("missing catalog entries are omitted without replacing them or moving other assets",()=>{
 const original=selectDecorations(input),missing=original[0]!.asset.id;
 expect(selectDecorations(input,{...DECORATION_MANIFEST,assets:DECORATION_MANIFEST.assets.filter(a=>a.id!==missing)})).toEqual(original.filter(d=>d.asset.id!==missing));
 expect(selectDecorations(input,{...DECORATION_MANIFEST,assets:[]})).toEqual([]);
});
it("unsupported versions and changed launch metadata require an explicit version change",()=>{
 expect(()=>selectDecorations({...input,version:2})).toThrow();
 expect(()=>selectDecorations(input,{...DECORATION_MANIFEST,manifestVersion:2})).toThrow();
 expect(()=>selectDecorations(input,{...DECORATION_MANIFEST,assets:DECORATION_MANIFEST.assets.map(a=>({...a,width:128}))})).toThrow(/version/);
});
it("invalid dates and internal UUIDs cannot be used in place of an opaque workspace scope",()=>{
 expect(()=>selectDecorations({...input,date:"2026-02-30" as typeof input.date})).toThrow();
 expect(()=>selectDecorations({...input,ownerScope:"12345678-1234-4234-8234-123456789abc"})).toThrow();
});
it.each([
 {id:"../bad"},{path:"https://example.invalid/asset.svg"},{path:"/decorations/v1/../bad.svg"},
 {width:0},{height:Infinity},{themes:["unknown"]},{themes:[]},{corners:["center"]},
 {sizePercent:{min:90,max:80}},{sizePercent:{min:1,max:100}},{rotation:{min:-9,max:9}},
])("rejects invalid manifest metadata %j",patch=>{
 expect(decorationManifestSchema.safeParse({...DECORATION_MANIFEST,assets:[{...DECORATION_MANIFEST.assets[0],...patch}]}).success).toBe(false);
});
it("rejects duplicate stable IDs and duplicate local paths",()=>{
 expect(decorationManifestSchema.safeParse({...DECORATION_MANIFEST,assets:[DECORATION_MANIFEST.assets[0],DECORATION_MANIFEST.assets[0]]}).success).toBe(false);
});
