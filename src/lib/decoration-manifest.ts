import { z } from "zod";
import { themeIdSchema } from "../themes/theme-id.ts";
z.config({ jitless: true });

export const corners = ["topLeft", "topRight", "bottomLeft", "bottomRight"] as const;
const cornerSchema = z.enum(corners);
const bounds = (min: number, max: number) => z.strictObject({ min: z.number().int().min(min).max(max), max: z.number().int().min(min).max(max) }).refine(b => b.min <= b.max).readonly();
const unique = <T,>(values: readonly T[]) => new Set(values).size === values.length;
export const decorationAssetSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  path: z.string().regex(/^\/decorations\/v[1-9]\d*\/[a-z0-9-]+\.svg$/),
  width: z.number().int().min(16).max(256), height: z.number().int().min(16).max(256),
  themes: z.array(themeIdSchema).min(1).refine(unique).readonly(),
  corners: z.array(cornerSchema).min(1).refine(unique).readonly(),
  sizePercent: bounds(72, 92), rotation: bounds(-4, 4),
}).readonly();
export const decorationManifestSchema = z.strictObject({
  manifestVersion: z.number().int().positive(), arrangementVersion: z.number().int().positive(),
  assets: z.array(decorationAssetSchema).refine(a => unique(a.map(item => item.id)), "Duplicate asset IDs").refine(a => unique(a.map(item => item.path)), "Duplicate asset paths").readonly(),
}).readonly();
export type DecorationAsset = z.infer<typeof decorationAssetSchema>;
export type DecorationManifest = z.infer<typeof decorationManifestSchema>;

// Frozen launch membership: adding catalog assets never adds them to version 1.
// The asset checker also pins metadata and SVG byte hashes in a reviewed lock.
export const launchIds = Object.freeze({
  "sakura-pink": ["sakura-blossom-v1", "sakura-bunny-v1", "sakura-berry-v1", "sakura-hearts-v1"],
  "dreamy-sky": ["sky-cloud-v1", "sky-moon-v1", "sky-kite-v1", "sky-stars-v1"],
  "lavender-dreams": ["lavender-sprig-v1", "lavender-moth-v1", "lavender-cup-v1", "lavender-orbit-v1"],
  "vintage-journal": ["vintage-book-v1", "vintage-leaf-v1", "vintage-letter-v1", "vintage-teapot-v1"],
} as const);
export const ARRANGEMENT_VERSION = 1;
export const DECORATION_MANIFEST = decorationManifestSchema.parse({
  manifestVersion: 1, arrangementVersion: ARRANGEMENT_VERSION,
  assets: Object.entries(launchIds).flatMap(([theme, ids]) => ids.map(id => ({
    id, path: `/decorations/v1/${id}.svg`, width: 96, height: 96, themes: [theme],
    corners: id.includes("cup") || id.includes("teapot") ? ["topLeft", "bottomLeft"] : [...corners],
    sizePercent: { min: 82, max: 90 }, rotation: { min: -3, max: 3 },
  }))),
});
