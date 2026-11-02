# Phase 8 — local implementation handoff

3 November 2026. **Final local verification passed.** Owner visual acceptance remains pending. Exact results are recorded in `artifacts/phase-8/verification.json`.

Starting branch `main`; HEAD, `origin/main` and GitHub `main` were confirmed at `0a5d4bb4e3d3ecfe8b59c7b74b84b59d624a7c81`. Work is local and uncommitted. No production database access/change, migrations, grants, credential/environment change, real email, Vercel change, deployment, commit or push was performed. Phase 9/10 have not started. Owner visual acceptance remains pending.

## Implemented system

The fixture map in DiaryPaper is replaced by a small DecorationLayer and a pure selector. The session exposes only its existing opaque owner workspace scope; no internal owner UUID or new identity response is added. The seed combines that scope, validated Gregorian date, theme and arrangement version 1. FNV-1a ranks a frozen launch membership, with explicit corner matching and bounded image sizes/rotations. Manifest version 1 is separately validated. Reordering or unrelated catalog additions cannot reshuffle launch dates. Changes to launch metadata, artwork bytes or selector source fail a checked-in lock rather than silently altering arrangements.

All four corner frames remain at the approved positions. Desktop shows four images; ≤40rem shows two diagonal accents and avoids hidden image requests through native lazy loading. Failed images hide only their reserved frame. Missing catalog entries are omitted without replacement or rearranging other assets. No image callback focuses, scrolls or mutates writing. Editor/date/paper geometry, rule spacing and tokens remain unchanged.

The original creation instruction is fulfilled with sixteen new SVGs, without downloading or tracing reference artwork:

| Theme | Original subjects | Four-image gzip total |
| --- | --- | --- |
| Sakura Pink | Blossom, bunny, berry, hearts | 1,182 bytes |
| Dreamy Sky | Cloud, moon, kite, stars | 1,056 bytes |
| Lavender Dreams | Sprig, moth, cup, orbit | 1,198 bytes |
| Vintage Journal | Book, leaf, letter, teapot | 1,190 bytes |

Every SVG is 96 × 96 intrinsic units, 356–603 bytes raw; the entire collection is 7,058 raw bytes. The maximum individually gzip-compressed arrangement is 1,198 bytes, below the approximate 200 KiB target. Sources are reproducible in `scripts/draw-decorations.mjs`; production SVGs contain no source metadata, external resources, fonts, raster payloads or executable content. Existing temporary files are preserved for historical reference but are not requested by the app.

These original, AI-assisted artwork contributions have a local CC0-1.0 dedication and per-file provenance/checksums. No third-party artwork license is assumed. The official [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/) and legal-code reference were checked. Provenance and final visual acceptance are separate: original sources/rights are documented; the owner must still review the proposed style.

Technical contract/versioning/missing-asset/operations details: [decoration system](phase-8-decoration-system.md). Exact assets and provenance: [asset manifest](../artifacts/phase-8/asset-manifest.json), [provenance](../artifacts/phase-8/asset-provenance.json).

## Verification

Pinned Node 24.22.1 and pnpm 12.8.1. No dependencies or environment variables added; lockfile unchanged. Database suites use disposable loopback TLS PostgreSQL 14.24, synthetic accounts and a local mail sink. No production Neon access occurs.

| Check | Actual result |
| --- | --- |
| Frozen install; token CSS; decoration source/lock/budget | Passed |
| Lint; strict TypeScript | Passed |
| Unit/component tests | 211 passed, 15 files |
| PostgreSQL auth / diary / preferences | 14 / 10 / 9 passed |
| Production build | Passed |
| Client-output secret scan | Passed, 24 assets/payloads |
| Full Playwright regression suite | 237 passed, 79 per project; zero failed/skipped; 5.3 minutes |
| Accessibility | 66 Axe scans, zero violations |
| Repository secret/whitespace audit | 375 files passed; tracked and new-file whitespace passed |
| Remote CI | Not run; commit/push not authorized |

Twenty-one new unit/component cases cover manifest rejection, deterministic variation, ordering/addition stability, corner/theme/size/rotation rules, explicit version changes, missing catalog entries, opaque scope validation, server/client markup equivalence and failed image state. Six browser journeys per viewport add exact Node-versus-browser comparisons, theme/date screenshots, responsive counts/loading, no overlap/overflow, in-flight autosave and composition, exact retained recovery metadata, navigation/refresh, same-owner reauthentication, cross-session/viewport consistency, and failed image focus/selection/scroll/layout-shift checks. The existing 219 browser regressions remain. The new six-test desktop repetition passed 6/6 after the date-activation test barrier was corrected; capture regression passed 3/3 after the visible-image helper correction.

Intermediate diagnostics are preserved honestly: a new test's Window type annotation initially failed strict typing and was corrected. An early focused run had 14 passes and 4 failures from an incorrect initial-HTML assumption plus an early date-navigation assertion. The private editor intentionally mounts client-side; no architecture change was made to force SSR artwork. A subsequent focused run passed 18/18. An initial complete run passed 235/237, with two capture timeouts waiting for intentionally hidden lazy images. The helper now decodes visible images, including after each theme switch. A later desktop navigation assertion read the previous arrangement immediately after the URL changed; that diagnostic run was stopped gracefully (87 passed, one failed, one interrupted, 148 not run). The corrected test waits for the editor's date identity and compares exact deterministic output, rather than assuming every pair of dates differs. No application safeguard or existing regression assertion was weakened; no timeout was increased. Final complete results supersede these diagnostics.

## Screenshots and comparison

Twenty-four dedicated artwork captures cover four themes × two selected dates (31/10/2026 and 01/11/2026) × desktop/390 px/320 px. Existing auth, settings, recovery and conflict captures are also regenerated in the Phase 8 folder; prior phase evidence is untouched. Each matrix cell below links the approved Phase 7 image and the new Phase 8 image for 01/11/2026.

| Theme | Desktop before → after | 390 px before → after | 320 px before → after |
| --- | --- | --- | --- |
| Sakura | [before](../artifacts/phase-7/theme-chromium-sakura-pink.png) → [after](../artifacts/phase-8/decorations-chromium-sakura-pink-01-11-2026.png) | [before](../artifacts/phase-7/theme-mobile-390-sakura-pink.png) → [after](../artifacts/phase-8/decorations-mobile-390-sakura-pink-01-11-2026.png) | [before](../artifacts/phase-7/theme-mobile-chromium-sakura-pink.png) → [after](../artifacts/phase-8/decorations-mobile-chromium-sakura-pink-01-11-2026.png) |
| Sky | [before](../artifacts/phase-7/theme-chromium-dreamy-sky.png) → [after](../artifacts/phase-8/decorations-chromium-dreamy-sky-01-11-2026.png) | [before](../artifacts/phase-7/theme-mobile-390-dreamy-sky.png) → [after](../artifacts/phase-8/decorations-mobile-390-dreamy-sky-01-11-2026.png) | [before](../artifacts/phase-7/theme-mobile-chromium-dreamy-sky.png) → [after](../artifacts/phase-8/decorations-mobile-chromium-dreamy-sky-01-11-2026.png) |
| Lavender | [before](../artifacts/phase-7/theme-chromium-lavender-dreams.png) → [after](../artifacts/phase-8/decorations-chromium-lavender-dreams-01-11-2026.png) | [before](../artifacts/phase-7/theme-mobile-390-lavender-dreams.png) → [after](../artifacts/phase-8/decorations-mobile-390-lavender-dreams-01-11-2026.png) | [before](../artifacts/phase-7/theme-mobile-chromium-lavender-dreams.png) → [after](../artifacts/phase-8/decorations-mobile-chromium-lavender-dreams-01-11-2026.png) |
| Vintage | [before](../artifacts/phase-7/theme-chromium-vintage-journal.png) → [after](../artifacts/phase-8/decorations-chromium-vintage-journal-01-11-2026.png) | [before](../artifacts/phase-7/theme-mobile-390-vintage-journal.png) → [after](../artifacts/phase-8/decorations-mobile-390-vintage-journal-01-11-2026.png) | [before](../artifacts/phase-7/theme-mobile-chromium-vintage-journal.png) → [after](../artifacts/phase-8/decorations-mobile-chromium-vintage-journal-01-11-2026.png) |

The 31/10/2026 views use the same filename pattern ending `31-10-2026.png`. Both date matrices were inspected, including full-size representative desktop/mobile views. The diary remains dominant; nothing overlaps dates, writing or controls. Intentional differences are the themed originals/date-specific arrangements, two visible mobile accents, and replacement of the temporary-artwork label. The six CSS-pixel reference comparisons preserve paper/editor rectangles, line height and overflow; all six checked header/date/writing regions are pixel-identical; exact metrics are recorded in [visual comparison](../artifacts/phase-8/visual-comparison.json). Artwork/footer regions are intentionally excluded from pixel equality.

## Inventory and boundaries

Inventory: **11 modified, 98 created, zero deleted, zero staged**. [Complete file manifest](../artifacts/phase-8/file-manifest.json) records every path. Source integration is limited to DiaryPaper, decoration-only CSS, one opaque-scope context field and the artwork footer label. New files provide the pure manifest/selector, DecorationLayer, sixteen vectors/license, original-source/check scripts/lock, tests and evidence. CI adds only the asset check. Existing test captures target `artifacts/phase-8/` so accepted prior evidence is preserved.

Approved Word plans, canonical theme tokens/generated CSS, date utilities/routes, authentication/owner boundaries, database schemas/roles/APIs, preferences, editor workspace, autosave and IndexedDB recovery implementations remain unchanged. Existing Phase 1–7 invariants pass the retained regression suite. No new tables, migrations, endpoints, environment variables, dependencies, shuffle, uploads, preferences, animation or decoration persistence were introduced.

Remaining review: owner visual acceptance of the original artwork. Chromium/Pixel emulation and automated Axe do not establish Safari/iOS or real-device acceptance. Hidden-image lazy-loading heuristics may differ by engine; reserved boxes still protect layout. HMAC identity-key or explicit arrangement-version changes can change arrangements; neither is performed here. Missing assets are omitted, not automatically retried or replaced. Earlier persistence/recovery limitations remain. This is not a production-readiness claim.

No production operations, deployment, commit, push, Phase 9 or Phase 10 work occurred. Stop for owner review and separate authorization.

## Publication verification

The owner subsequently authorized committing and pushing Phase 8. The complete verification sequence was repeated on the reviewed final tree using Node 24.22.1 and pnpm 12.8.1: frozen install, tokens, decoration checks, lint, strict TypeScript, 211 unit/component tests, PostgreSQL suites (14 auth, 10 diary, 9 preferences), production build, client-output scan and all 237 browser tests passed (5.5 minutes, no failures/skips). All 66 Axe scans passed. Regenerated evidence retained all six unchanged paper/editor geometry and header/date/writing pixel comparisons. The repository secret and whitespace audit was repeated before staging. No production operations or Phase 9/10 work were authorized or performed. Exact pushed SHA and remote CI result will be reported separately after publication; this pre-commit report does not claim remote success.
