# Phase 8 — stable themed decorations

Local implementation for owner review. Starting `main` commit: `0a5d4bb4e3d3ecfe8b59c7b74b84b59d624a7c81`. No production database, migration, grant, credential, Vercel configuration, email delivery, deployment, commit or push is part of this phase. Phase 9 has not started. Approved source plans are unchanged.

## Illustration collection and rights

Sixteen new original, AI-assisted SVG drawings are authored as vector code in `scripts/draw-decorations.mjs`, four for each approved theme. They are not downloaded, extracted or traced from the reference screenshot. The existing Phase 2 temporary files are preserved as historical source, but are no longer referenced by the application. New launch candidates are bundled in `public/decorations/v1/`; each has a 96 × 96 intrinsic canvas and contains only small static vector primitives. The authoring source is outside the public bundle. No fonts, raster payloads, scripts, metadata, external resources or image dependencies are embedded.

The new illustration contributions have a CC0-1.0 dedication, limited to the original artwork/source, with a local notice in `public/decorations/v1/LICENSE.txt`. Attribution is not required. Creative Commons' [official CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/) and [legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en) are the license references. CC0 does not itself verify an asset's provenance; the original source coordinates and per-file hashes supply the separate project provenance record. No claim of ownership over third-party material is made. Final owner visual acceptance remains pending.

`artifacts/phase-8/asset-provenance.json` records every stable asset ID, creator/source location, license, attribution requirement, optimized location, format, dimensions and SHA-256. `asset-manifest.json` additionally records raw, gzip and Brotli bytes. The maximum launch arrangement is **1,198 bytes gzip**, summing individually compressed responses, against the approximate 204,800-byte budget. This excludes HTTP header overhead and the application bundle. Theme maxima: Sakura 1,182; Sky 1,056; Lavender 1,198; Vintage 1,190 bytes. SVGs remain sharp across DPRs without alternate raster sizes.

## Manifest and frozen launch policy

`src/lib/decoration-manifest.ts` defines strict Zod schemas and a readonly manifest. Manifest version 1 and arrangement version 1 are distinct, explicit values. Fields include stable ID, local versioned SVG path, intrinsic dimensions, compatible theme IDs, permitted corners, image-size percentage and rotation bounds. Duplicate IDs/paths, unsupported themes/corners, remote/traversal paths, nonpositive/oversized dimensions, duplicate membership and inverted/out-of-range bounds are rejected.

The launch list pins four IDs per theme independently of filesystem or manifest order. All assets permit each corner except the cup and teapot, which permit left corners. Image sizes are 82–90% of the pre-existing corner frame, with an additional restrained −3° to +3° inner-image rotation. Existing frame positions, dimensions and rotations are retained. Schema safety ceilings are 72–92% and −4° to +4°; the frozen launch entries use the narrower bounds.

`scripts/decoration-v1.lock.json` pins launch metadata, SVG bytes and the version-1 selector source hash. `pnpm decorations:check` checks the original drawing outputs and lock, safe static SVG form and arrangement byte budget. CI runs the same check. It never rewrites the lock. Evidence generation is explicit: `node scripts/check-decorations.mjs --write-evidence`.

## Deterministic selection

`src/lib/decorations.ts` is pure and independent of React, storage, time, randomness, timezone and viewport. The seed is the JSON tuple `['dear-diary-decorations', arrangementVersion, opaqueOwnerScope, canonicalCalendarDate, themeId]`. Calendar identity is the existing validated Gregorian `CalendarDate`, not a timestamp; public dates/URLs remain DD/MM/YYYY.

The existing server-derived `w1_…` workspace pseudonym supplies the owner scope. It is already issued by the authoritative ownership layer using the existing purpose-separated HMAC. No internal owner UUID, new identity API, secret or database value is introduced. Isolated non-authenticated component previews use a fixed `preview` scope; they never authorize an application route or access storage.

FNV-1a hashes UTF-8 bytes with explicitly bounded 32-bit `Math.imul` arithmetic. It ranks pinned candidates separately for each corner with a stable ASCII-ID tie break. A four-corner matching search prevents left-only art from being stranded in a right slot. Each asset appears once. Size and rotation use separate seed suffixes and inclusive bounded integer selection. This is a visual algorithm, not cryptography or authorization. Tests check varied assignments over representative dates; uniqueness of every date is neither required nor claimed.

Matching uses frozen launch membership before omissions. If an entry is absent from a supplied catalog, omit its selected slot without replacing it or moving other assets. Reordering entries or adding unrelated catalog assets does not affect version-1 output. Existing IDs with changed rendering metadata are rejected rather than silently reshuffling. Node/server execution and browser rendering use the same module and inputs. The existing private editor mounts client-side after authorized date activation; this phase does not change that lifecycle merely to add SSR artwork. Tests compare Node selection against the actual browser metadata and independently compare server-rendered DecorationLayer markup with client rendering.

## Rendering, safe areas and responsive loading

`DecorationLayer` replaces only the fixture map inside `DiaryPaper`. The session supplies its existing opaque scope and current theme. Memoization keys are scope/date/theme; typing and save callbacks do not supply new inputs. Card/image keys affect only decoration nodes. The textarea, workspace, entry controller, recovery store, preference controller, date routes and authentication lifecycle are not replaced or reconfigured.

The existing absolute corner frames reserve dimensions inside the paper. The salutation, textarea margins, ruled spacing, paper border/proportions and date-safe rectangle are unchanged. Artwork is contained within the frames with additional inner padding. The layer has `aria-hidden`, empty image alt text, no focusable elements, no pointer events and no animation. Native image dimensions are explicit; SVG is served unoptimized as recommended by the installed Next.js documentation. No remote loader, preload list or image-optimization permission is added.

At widths ≤40rem the top-right and bottom-left frames are omitted visually, leaving two small diagonal accents. Existing mobile writing/date geometry remains unchanged. These secondary images use native lazy loading; Chromium tests verify they are not downloaded while hidden. The two primary images load eagerly. Desktop shows the full four-slot arrangement; resizing changes visibility, not selection. Other engines' lazy-loading heuristics require later device review.

An image load error hides only its existing reserved frame. It does not replace the artwork with broken-image text, focus anything, change the arrangement, or move writing. No destructive retry or content mutation occurs. Missing catalog entries similarly leave an empty absolute slot. Build-time file checks report missing files; a runtime 404 still degrades quietly and safely.

## Introducing future art safely

Do not rename launch IDs, edit deployed v1 SVG bytes, change launch membership/metadata or alter the v1 selector silently. Keep the v1 lock and algorithm available. Unrelated catalog additions are inert until an explicit new arrangement policy selects them. For a deliberate change, add a new versioned asset directory, new stable IDs and reviewed manifest/arrangement version; preserve version-1 behavior and regression vectors. A changed global default version intentionally changes date arrangements and requires owner approval. There is no per-date version persistence, shuffle control, custom upload or decoration administration.

Changes to the existing opaque identity derivation key would also change owner scope and therefore arrangements; this remains an operator-controlled identity/recovery concern, not an artwork setting. Browser storage eviction and the existing persistence/recovery limitations remain unchanged.

## Verification and review evidence

Verification results, exact counts and scope are in `artifacts/phase-8/verification.json`; inventory is in `file-manifest.json`. The final handoff records any intermediate failures separately from the successful final suite. Disposable local PostgreSQL and synthetic identities/mail are used exclusively.

Before/after references: approved Phase 7 captures remain in `artifacts/phase-7/`; new captures and measurements are in `artifacts/phase-8/`. All four themes have captures on two dates at desktop, 390 px and 320 px. Intentional differences are the new themed artwork/date arrangements, two visible mobile illustrations, and removal of the temporary-artwork label. Geometry comparisons cover paper/editor rectangles, line heights, date/header and writing-safe regions; artwork/footer pixels are expected to differ.

Owner review is still required for the proposed illustration style. Automated Chromium/accessibility evidence is not Safari, a real-device review or production readiness. No Phase 9/10 work is included.
