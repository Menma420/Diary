import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync } from "node:zlib";
import assert from "node:assert/strict";
import { DECORATION_MANIFEST, launchIds } from "../src/lib/decoration-manifest.ts";

const digest = data => createHash("sha256").update(data).digest("hex");
const pinned = new Set(Object.values(launchIds).flat());
const assets = DECORATION_MANIFEST.assets.filter(a => pinned.has(a.id)).toSorted((a,b) => a.id < b.id ? -1 : 1);
const inventory = [];
for (const asset of assets) {
 const bytes = await readFile(`public${asset.path}`), svg = bytes.toString("utf8");
 assert(bytes.length < 8192, "Oversized decoration");
 assert(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">'), "SVG dimensions mismatch");
 assert(!/<(?:script|foreignObject|image|metadata|style|text)\b|\b(?:href|on\w+)\s*=|<!|url\(/i.test(svg), "Unsafe or externally dependent SVG");
 inventory.push({...asset,format:"svg",bytes:bytes.length,gzipBytes:gzipSync(bytes).length,brotliBytes:brotliCompressSync(bytes).length,sha256:digest(bytes)});
}
const actual = {manifestVersion:DECORATION_MANIFEST.manifestVersion,arrangementVersion:DECORATION_MANIFEST.arrangementVersion,manifestSha256:digest(JSON.stringify(assets)),algorithmSha256:digest(await readFile("src/lib/decorations.ts")),assets:inventory.map(({id,sha256})=>({id,sha256}))};
const lock = JSON.parse(await readFile("scripts/decoration-v1.lock.json","utf8"));
assert.deepEqual(actual,lock,"Frozen launch assets/algorithm changed: introduce an explicit new version, do not rewrite the v1 lock");
const weights = Object.fromEntries(Object.keys(launchIds).map(theme=>[theme,inventory.filter(a=>a.themes.includes(theme)).reduce((sum,a)=>sum+a.gzipBytes,0)]));
for(const bytes of Object.values(weights))assert(bytes<=200*1024,"Visible arrangement exceeds compressed budget");
if(process.argv.includes("--write-evidence")){
 await mkdir("artifacts/phase-8",{recursive:true});
 await writeFile("artifacts/phase-8/asset-manifest.json",JSON.stringify({...DECORATION_MANIFEST,assets:inventory,compression:"Sum of individually gzip-compressed SVG responses; Brotli also recorded",maximumFourAssetGzipBytesByTheme:weights},null,2)+"\n");
 await writeFile("artifacts/phase-8/asset-provenance.json",JSON.stringify({collection:"Dear Diary original vectors v1",creator:"AI-assisted original vector code authored for Dear Diary Phase 8",license:"CC0-1.0",licenseReference:"https://creativecommons.org/publicdomain/zero/1.0/",localLicense:"public/decorations/v1/LICENSE.txt",ownerVisualAcceptance:"Pending owner review; original artwork creation authorized in Phase 8",assets:inventory.map(({id,path,width,height,format,sha256})=>({id,source:"scripts/draw-decorations.mjs",originalSourceLocation:`scripts/draw-decorations.mjs#${id}`,optimizedFile:`public${path}`,width,height,format,sha256,license:"CC0-1.0",attributionRequired:false,provenance:"New geometric SVG coordinates; no downloaded, traced or reference-screenshot artwork"}))},null,2)+"\n");
}
console.log(`Decoration checks passed: ${assets.length} original SVGs; frozen v1 metadata/bytes/algorithm; maximum arrangement ${Math.max(...Object.values(weights))} gzip bytes (budget 204800).`);
