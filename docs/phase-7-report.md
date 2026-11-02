# Phase 7 — persisted themes and settings

Local owner-review handoff, 2 November 2026. Starting branch `main`, clean at `0122ee34fee82ed7a25f0e64fb051948b1dcf8d2`. Phase 7 remains uncommitted. No production connection, migration, role/grant/credential change, account operation, real email, Vercel configuration change, frontend deployment, commit or push was performed. Phase 8 is not started; production readiness is not claimed.

## Implementation and contracts

The four approved tokens/themes, palette selector, textarea, date routing, editor workspace, entry autosave and IndexedDB recovery are reused. Preferences have their own small contract, HTTP adapter and serialized controller. Theme/timezone changes never call entry or recovery mutation APIs, change editor keys, or perform navigation. Existing entry controller/store/workspace and diary migration 001 are unchanged.

Migration **`migrations/diary/002_preferences.sql`** creates one owner-keyed preferences row and an independent exact-mutation ledger. Fields are owner ID, theme, timezone, bounded version, last mutation ID and timestamps. Missing preferences return Sakura Pink / Asia/Kolkata / version 0 without inserting a row. New constraints permit exactly four themes; API/ICU and PostgreSQL catalog validation enforce IANA timezone support. The ledger reserves conflicted mutation IDs too. Updates use atomic compare-and-set, and identical historical retries return the original receipt. Entry rows/versions/mutation receipts remain independent.

`GET /api/preferences` returns a validated preference snapshot. `PATCH /api/preferences` accepts exactly `{theme,timezone,baseVersion,mutationId}`; it returns a matching committed acknowledgement or 409 with current server preferences. Authentication, origin/Fetch Metadata, bounded input, strict schemas and private/no-store handling are enforced independently. No browser owner ID is trusted. Errors do not expose database identity, driver errors or credentials.

Root HTML receives the server-loaded `data-theme` before the authenticated diary paints. Root and diary layouts deduplicate the same request through React's request-scoped RSC cache, with no process identity cache. Client-side login/navigation applies the same initial snapshot in a layout effect. An initial read failure displays retry instead of a default-looking editable diary. An unsupported legacy stored theme previews Sakura with a visible, explicit, version-checked repair; invalid timezone or receipt metadata remains a failed read. No unverified version is invented.

Immediate choices are separate from immutable in-flight snapshots. An older acknowledgement cannot revert a newer selection. Every receipt is checked against a fresh read before Saved/dispatching the next revision. Lost responses retain exact mutation identity in memory for Retry. A conflict preserves local/server choices and checks fresh versions again before either explicit choice. Preference errors/status are independent of entry SaveStatus. Focus/pageshow and same-owner session restoration revalidate preferences. Auth denial pauses preference writes and preserves the existing locked owner workspace.

The compact Settings dialog supplies four named previews, current selection, timezone validation, save/error/conflict feedback and accessible native dialog behavior. The existing header control stays in place. Settings has a 44 px touch target. Preference status is outside layout flow so it cannot shrink the paper. Closing restores the writing selection/direction/scroll synchronously once, or returns keyboard focus to the trigger; a later native close callback cannot steal focus. Session lock closes the dialog.

Timezone changes affect future Today calculations in the header/calendar and server index redirects. They do not move the selected page, reinterpret dates or relabel existing entries. DD/MM/YYYY routes and strict Gregorian calendar utilities remain unchanged. No preference IndexedDB, settings page, theme redesign or decorative finalization was added.

Full data model, API, state semantics, timezone rules, permission model and rollback considerations: [preferences contract](phase-7-preferences.md).

## Database permissions and environment

[Actual disposable permission evidence](../artifacts/phase-7/database-permissions.json): runtime preference read/write execution true; direct preference tables/columns/receipts, owner binding and schema CREATE false. Both tables have forced RLS and the existing non-login data owner. Both controlled functions are SECURITY DEFINER with fixed `search_path=pg_catalog, pg_temp`. Runtime guards reject privileged/auth pools, unsafe direct grants and wrong function ownership/paths; auth runtime rejects preference capabilities. Tests use independent loopback TLS PostgreSQL **14.24**, synthetic owners and the local mail sink. Production Neon was never accessed.

No dependency was added/upgraded and the lockfile is unchanged. No new environment variable or database connection was introduced. The existing restricted `DIARY_DATABASE_URL` is reused without auth/provisioning fallback. `.env.local` and `.neon` remain ignored. Toolchain: Node **24.22.1**, pnpm **12.8.1**, with existing pinned application/test dependencies.

## Verification

The final complete verification passed against the final implementation. No failed or skipped tests remain in that run. [Machine-readable results](../artifacts/phase-7/verification.json) record the exact counts and scope.

| Command/check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; no dependency/lock changes |
| `pnpm tokens:check` | Passed; canonical token CSS unchanged |
| `pnpm lint` | Passed; zero warnings |
| `pnpm typecheck` | Passed; Next typegen and strict tsc |
| `pnpm test` | 190 passed, 13 files |
| `pnpm test:auth` | 14 passed, disposable PostgreSQL |
| `pnpm test:diary` | 10 passed, disposable PostgreSQL |
| `pnpm test:preferences` | 9 passed, disposable PostgreSQL |
| `pnpm build` | Passed; dynamic private routes, no build-time database query |
| `pnpm check:client` | Passed; 24 browser assets/payloads |
| `pnpm test:e2e` | 219 passed, 73 per project; zero failed/skipped; 5.0 minutes |
| Accessibility | 54 Axe scans, zero violations, within full Playwright suite |
| Repository secret audit / `git diff --check` | Passed; 277 repository files scanned; whitespace clean |
| Remote CI | Not run; workflow extended with preferences suite; no commit/push authorized |

The browser suite retains every Phase 1–6 regression and adds 12 preference journeys per viewport. It tests all themes/refresh/new login, root theme HTML, concurrent sessions, rapid selection with delayed acknowledgement, exact lost-response retry followed by newer choices, entry save barriers, exact retained IndexedDB records, independent errors, composition, timezone/Today, owner/origin rejection, explicit legacy repair, session expiry after a committed but delayed preference response, and synchronous plus delayed focus/selection/scroll preservation. Final SQL content/version and relevant records are asserted. Desktop Chromium and 320/390 px Pixel emulation run the same suite. This is not Safari or real-device evidence.

Intermediate checks found and fixed: the Settings touch target; late native dialog-close selection/focus behavior; a hidden Retry path after selecting a newer preference during an uncertain mutation; and mobile paper shrinkage from an in-flow status label. Strict regression assertions were retained. An early command used the shell's Node 20 and failed to start test workers; all reported final checks use pinned Node 24. One sandboxed build could not parse the TypeScript subprocess output; standalone type checks and subsequent full builds succeeded without weakening validation. A permission-evidence probe correctly denied private-schema access; operator catalog inspection in the disposable cluster recorded effective permissions without granting new runtime access. These intermediate runs are superseded by final verification.

## Screenshots and visual comparison

Actual local production-build captures with disposable data:

| Theme | Desktop | 320 px | 390 px |
| --- | --- | --- | --- |
| Sakura Pink | [desktop](../artifacts/phase-7/theme-chromium-sakura-pink.png) | [320](../artifacts/phase-7/theme-mobile-chromium-sakura-pink.png) | [390](../artifacts/phase-7/theme-mobile-390-sakura-pink.png) |
| Dreamy Sky | [desktop](../artifacts/phase-7/theme-chromium-dreamy-sky.png) | [320](../artifacts/phase-7/theme-mobile-chromium-dreamy-sky.png) | [390](../artifacts/phase-7/theme-mobile-390-dreamy-sky.png) |
| Lavender Dreams | [desktop](../artifacts/phase-7/theme-chromium-lavender-dreams.png) | [320](../artifacts/phase-7/theme-mobile-chromium-lavender-dreams.png) | [390](../artifacts/phase-7/theme-mobile-390-lavender-dreams.png) |
| Vintage Journal | [desktop](../artifacts/phase-7/theme-chromium-vintage-journal.png) | [320](../artifacts/phase-7/theme-mobile-chromium-vintage-journal.png) | [390](../artifacts/phase-7/theme-mobile-390-vintage-journal.png) |

Settings: [desktop](../artifacts/phase-7/settings-chromium.png), [320](../artifacts/phase-7/settings-mobile-chromium.png), [390](../artifacts/phase-7/settings-mobile-390.png). Login, reauthentication, entry conflicts and degraded recovery captures remain in the Phase 7 folder too.

[Visual comparison](../artifacts/phase-7/visual-comparison.json) compares the approved Phase 6 CSS-pixel captures at desktop and both mobile widths, excluding the intentionally updated footer. All six paper/editor geometries and line heights match, with no overflow. Five header/paper captures are pixel-identical. The fresh final audit capture at 390 px differs only at 14 rounded-corner pixels by one color-channel level; geometry and line heights are identical. Exact metrics are in the JSON. An initial exact-zero diagnostic flagged this raster variation; it is recorded rather than hidden or treated as a design change. The intentionally added footer controls/status are excluded from pixel equality. Original paper, text, line spacing, date/header, four illustration positions and tokens are preserved; settings/feedback are the intended additions.

## Inventory, limits and production gates

Inventory: **21 modified, 59 created, zero deleted, zero staged**. [Complete file inventory](../artifacts/phase-7/file-manifest.json) lists all files. Main changes: new preference migration, contracts/server repository/API/HTTP controller, initial server presentation, Settings/ThemeSelector, minimal session/context integration, privilege/fixture/CI extensions, tests and evidence. Approved Word plans, original theme tokens/generated CSS, prior phase artifacts and existing autosave/recovery implementations are unchanged. README now describes persisted preferences and isolated preference verification.

Pending preference choices and unresolved preference requests are memory-only by design. Refresh/close can lose an uncommitted choice; confirm Settings saved when persistence matters. Entry recovery is unaffected. There is no continuous cross-tab synchronization: focus/restoration reads reconcile versions. Receipt retention needs a future reviewed policy. ICU/PostgreSQL timezone catalogs may differ; unsupported values fail rather than silently changing dates. Browser eviction and other Phase 6 limits remain. Safari/iOS and real mobile keyboards require later review.

Production rollout requires separate approval, target-version isolated Neon rehearsal, reviewed migration 002 before the matching app build, verification of effective runtime grants, backups/rollback evidence and an independently authorized deployment. Existing owner accounts, production entry data, roles/grants, credentials and Vercel environment remain untouched. No production readiness claim is made.

Stop after Phase 7. Await owner review before commit, push, production changes, deployment or Phase 8.
