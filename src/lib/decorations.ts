import { z } from "zod";
import { parseCalendarDate, type CalendarDate } from "./dates.ts";
import { themeIdSchema } from "../themes/theme-id.ts";
import { ARRANGEMENT_VERSION, DECORATION_MANIFEST, corners, decorationManifestSchema, launchIds, type DecorationAsset, type DecorationManifest } from "./decoration-manifest.ts";

const inputSchema = z.strictObject({
  ownerScope: z.string().regex(/^(?:w1_[A-Za-z0-9_-]{43}|preview)$/),
  date: z.string().refine(value => parseCalendarDate(value) !== null),
  theme: themeIdSchema, version: z.literal(ARRANGEMENT_VERSION).default(ARRANGEMENT_VERSION),
});
export type Decoration = Readonly<{ asset: DecorationAsset; corner: typeof corners[number]; sizePercent: number; rotation: number }>;
// FNV-1a on UTF-8 bytes; Math.imul pins overflow identically in Node and browsers.
// This is a visual selector, not a cryptographic or authorization mechanism.
function hash(value: string) {
  let result = 2166136261;
  for (const byte of new TextEncoder().encode(value)) result = Math.imul(result ^ byte, 16777619);
  return result >>> 0;
}
function bounded(seed: string, { min, max }: { min: number; max: number }) { return min + hash(seed) % (max - min + 1); }
function sameAsset(a: DecorationAsset, b: DecorationAsset) {
  return a.path === b.path && a.width === b.width && a.height === b.height &&
    [...a.themes].sort().join() === [...b.themes].sort().join() && [...a.corners].sort().join() === [...b.corners].sort().join() &&
    a.sizePercent.min === b.sizePercent.min && a.sizePercent.max === b.sizePercent.max && a.rotation.min === b.rotation.min && a.rotation.max === b.rotation.max;
}
export function selectDecorations(input: { ownerScope: string; date: CalendarDate; theme: z.infer<typeof themeIdSchema>; version?: number }, manifest: DecorationManifest = DECORATION_MANIFEST): readonly Decoration[] {
  const context = inputSchema.parse(input), catalog = decorationManifestSchema.parse(manifest);
  if (catalog.manifestVersion !== 1 || catalog.arrangementVersion !== context.version) throw new Error("Unsupported decoration version");
  const seed = JSON.stringify(["dear-diary-decorations", context.version, context.ownerScope, context.date, context.theme]);
  const pinned = DECORATION_MANIFEST.assets.filter(a => (launchIds[context.theme] as readonly string[]).includes(a.id));
  const available = new Map(catalog.assets.map(a => [a.id, a]));
  for (const asset of pinned) { const actual = available.get(asset.id); if (actual && !sameAsset(asset, actual)) throw new Error("Launch asset changed: explicit version change required"); }
  // Full matching prevents a left-only illustration stranding the last right slot.
  // Plan against frozen membership before omitting unavailable assets: no reshuffle.
  function match(index: number, used: readonly DecorationAsset[]): readonly DecorationAsset[] | null {
    if (index === corners.length) return used;
    const corner = corners[index]!;
    const ranked = pinned.filter(a => a.corners.includes(corner) && !used.includes(a)).sort((a, b) => hash(`${seed}|${corner}|${a.id}`) - hash(`${seed}|${corner}|${b.id}`) || (a.id < b.id ? -1 : 1));
    for (const candidate of ranked) { const result = match(index + 1, [...used, candidate]); if (result) return result; }
    return null;
  }
  return Object.freeze((match(0, []) ?? []).flatMap((asset, index) => available.has(asset.id) ? [Object.freeze({
    asset: available.get(asset.id)!, corner: corners[index]!,
    sizePercent: bounded(`${seed}|size|${asset.id}`, asset.sizePercent), rotation: bounded(`${seed}|rotation|${asset.id}`, asset.rotation),
  })] : []));
}
