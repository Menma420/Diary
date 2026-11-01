# Phase 6 — Database Autosave and Local Recovery

Local implementation handoff, 2 November 2026. Starting branch `main`, clean at `4484ac28ed38ec0841f53e6c8a75f48fb08b5e1e`. The implementation remains uncommitted. No production migration, role, account, data, secret, email setup, frontend deployment, commit or push was performed. Phase 7 is not started. Production readiness is not claimed.

## Implementation

- Reused Phase 4 `EditorWorkspace`, controller, plain-text document/revision/selection model, validated snapshots, immutable mutations and adapter contracts. Workspace additions are pure observation, initial/explicit hydration and baseline acknowledgement; save responses never replace textarea content.
- Reused Phase 5 authoritative `requireOwner()` / `VerifiedOwner` and opaque public workspace identity. Private server UUIDs are not used as browser recovery keys. Existing authentication, seven-day sessions, cookies, CSRF/CSP, reauthentication continuity and closed registration remain.
- Added PostgreSQL entries and exact-mutation receipts, controlled atomic functions, forced RLS, a separate function-owner group and restricted diary runtime group. A fresh effective-privilege guard refuses provisioning/auth credentials and unsafe grants. Auth runtime also rejects accidental diary-function capability.
- Added protected GET/PUT `/api/entries/DD/MM/YYYY`, strict calendar/input/UTF-8 validation, missing-versus-empty-versus-failed reads, atomic version checks, exact retries, changed-UUID-reuse rejection (including IDs reserved by rejected CAS attempts) and private/no-store sanitized errors.
- Added 1000 ms inactivity / 5000 ms maximum-wait autosave using a monotonic clock, one unresolved mutation per date, immutable snapshots, IME delay, outgoing saves, acknowledgement revision checks and explicit retry. Device wall-clock changes do not extend the maximum wait. UUID casing is treated consistently with PostgreSQL UUID identity.
- Implemented mandatory versioned IndexedDB recovery, serialized transactions, before-dispatch mutation capture, revision/base compare-and-set, acknowledgement floors, exact cleanup and explicit compare-and-supersede for owner conflict choices. No destructive repair, localStorage/sessionStorage substitute or dependency was introduced. The authenticated composition always creates IndexedRecovery; the provider's standalone preview path exists only to retain isolated Phase 4 component tests and is not an application storage opt-out.
- Startup and same-owner reauthentication reconcile every unresolved date/writer against fresh server reads. Multiple writers and advanced bases preserve both texts for deliberate resolution. Different identity scopes cannot inherit the workspace or load its recovery through the app. Incoming route activation, including history, keeps outgoing writing mounted until recovery transactions settle.
- Added compact save/device/error status and conflict review. Save and sign out flushes; failed/uncertain/busy/conflicting writing keeps the session and drafts. Errors on other dates are visible without a dashboard.

The approved design, four volatile theme previews, date routing/timezone and paper geometry are preserved. Preferences, deterministic asset finalization and later-phase features remain outside scope. The older plan's Supabase paths and Phase 6 preferences reference were identified during inspection; the owner's current Neon/Better Auth and Phase 6-only instructions control. Approved planning documents were not modified.

Full contracts, SQL/permissions, API, IndexedDB versioning, state transitions, reconciliation, production checklist and rollback considerations: [Persistence and recovery](phase-6-persistence-and-recovery.md).

## Database and environment evidence

Migration: [`migrations/diary/001_entries.sql`](../migrations/diary/001_entries.sql). Applied only in disposable, independently initialized TLS PostgreSQL clusters. Current test engine is PostgreSQL 14.24; production Neon was not accessed or modified.

`(owner_id,entry_date)` is unique. `entry_date` is a calendar `date`. Entries retain empty content; 256 KiB UTF-8 content, timestamps, bounded version and last mutation UUID are enforced. The owner-scoped ledger retains original date/content/base/committed acknowledgement so exact historical retries remain idempotent. Runtime has no direct table mutations.

[`database-permissions.json`](../artifacts/phase-6/database-permissions.json) records actual effective permissions: read/write function execution true; direct entries, entry columns, mutation ledger, owner binding, auth-account access and schema/database CREATE false. Both tables have enabled and forced RLS. Both SECURITY DEFINER functions have `search_path=pg_catalog, pg_temp` and the non-login `diary_data_owner` owner. Integration tests additionally reject operator/auth pools and accidental column grants, deny missing/mismatched owner bindings, and prove concurrency/idempotency and uniqueness against the real database.

New environment variable: **`DIARY_DATABASE_URL`**, server-only pooled verified-TLS URL for a separate LOGIN inheriting only `diary_entry_runtime`. Required for authenticated diary operations; not required for compilation/static prerendering. No fallback to AUTH/provisioning URLs. Existing AUTH_DATABASE_URL, signing/derivation secrets, APP_ORIGIN, timezone and mail configuration remain. `.env.example` contains comments only; `.env.local` and `.neon` remain ignored and untouched. Production configuration requires separate authorization.

No dependency was added or upgraded; the lockfile is unchanged. Verification used the pinned Node 24.22.1 / pnpm 12.8.1 toolchain, Next 16.4.3, React 19.3.1, pg 8.23.1, Better Auth 1.7.15, Zod 4.6.7, TypeScript 6.0.3, Vitest 5.0.5 and Playwright 1.64.1. The installed Vite builds a temporary test-only bundle for direct browser store tests; no test endpoint or production test bypass exists. Validators run jitless to preserve the existing strict CSP without unsafe-eval.

## Final verification

The final complete verification sequence passed against the final implementation. No failed or skipped tests remain in that run. [Machine-readable verification](../artifacts/phase-6/verification.json) records the counts and boundaries.

Commands use the pinned Node runtime on PATH. Disposable tests set `DIARY_TEST_PG_BIN` to the local PostgreSQL binaries and their extracted library directory; no production DB URL is consumed by the fixtures.

| Command/check | Final result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; no lockfile/dependency changes |
| `pnpm tokens:check` | Passed; canonical CSS unchanged |
| `pnpm lint` | Passed; zero warnings |
| `pnpm typecheck` | Passed; Next typegen and strict tsc |
| `pnpm test` | 175 passed, 11 files; zero failed/skipped |
| `pnpm test:auth` | 14 passed against disposable PostgreSQL |
| `pnpm test:diary` | 10 passed against disposable PostgreSQL |
| `pnpm build` | Passed; dynamic private entry endpoints; no DB needed during prerendering |
| `pnpm check:client` | Passed; 28 static assets/payloads checked |
| `pnpm test:e2e` | 183 passed, 61 per project; zero failed/skipped; 4.1 minutes |
| Accessibility | 42 Axe scans, zero violations, included in full Playwright suite: login/recovery/logout, calendar, four themes, conflict modal |
| Repository secret audit | Passed; configured private values and high-confidence secret patterns checked across the final repository inventory |
| `git diff --check` | Passed; final inventory check repeated at handoff |
| Remote CI | Workflow extended with diary DB checks; not run remotely because commit/push are excluded |

The browser suite includes every existing Phase 1–5 regression. Assertions that temporary drafts disappeared on refresh were updated to require persistence/recovery; they were not deleted. Signup denial, non-owner access, session expiry/reauthentication, keyboard/undo, navigation races, focus/selection/direction, scroll, long-paper growth, 200% reflow and mobile overflow checks remain. Each browser project executes the same 61 tests: desktop Chromium, 320 × 740 Pixel emulation and 390 × 844 Pixel emulation. These are Chromium checks, not Safari/real-device claims.

Earlier verification found and resolved object-key-order sensitivity in discard, CSP-sensitive validator JIT, an ambiguous alert test selector, a test timing assumption about URL changes preceding editor activation, and Vite's library output shape in the test harness. One intermediate database command also lacked the extracted PostgreSQL binary environment; it failed closed without connecting anywhere and was rerun with the explicit fixture paths. Extra review tightened rejected-mutation ID reservation, adoption/retirement provenance, historical receipt freshness, monotonic revision floors, retained same-writer cleanup visibility, multi-writer reauthentication ordering, pending-identity supersession, privilege separation, clock changes and UUID casing. Final results supersede those intermediate runs.

## Recovery and race verification matrix

| Required behavior | Executable evidence and final assertions |
| --- | --- |
| Refresh persistence and clear | Browser GET plus final PostgreSQL text/version; empty existing row version 2 and no unresolved IDB record |
| A → B before debounce / late A acknowledgement | Controlled A request barrier; B remains intact; both server versions 1; owner records empty after acknowledgement |
| Newer typing during old save | Response barrier; newer draft/current text and selection retained; first immutable pending content distinct; final server version 2; exact recovery cleanup |
| Historical acknowledgement after another device advanced | Combined browser journey retains the exact pending record and both texts, requires explicit choice, then proves subsequent writing remains durable |
| A writer discovered during an in-flight request | Reauthentication and delayed acknowledgement leave the unrelated writer record intact until deliberate resolution; final chosen entry/version and cleanup asserted |
| Monotonic revisions after recovery/choice | New writing after recovered ACK or server choice passes receipt floors, commits the next server version and leaves no false Recovery unavailable state |
| Unknown commit / exact retry | Real commit then dropped HTTP response; identical retry body/ID; server version stays 1; record removed only after confirmed retry |
| Reload uncertain commit | Exact pending record survives reload; ledger UUID unchanged, one committed version, recovery removed after reconciliation |
| Advanced server / deliberate resolution | Server and local text both present before choice; record retained; fresh version checked; a second advance requires renewed review; chosen write version 2 or server choice leaves version 2 |
| Every date/writer and empty recovery | Three seeded dates including empty writing restored; multiple writers require choice; all final DB snapshots asserted; acknowledged records removed; no timestamp winner |
| Expiry / same-owner restore | DB session revocation, retained local record and textarea, same-owner login; server version 1 and record cleanup; existing node/selection/date/scroll regression retained |
| Different identity | Non-owner GET/PUT denied; genuinely different disposable owner scope after reload gets blank own date and cannot load/render original recovery; original records remain byte-for-byte equivalent |
| Quota / transaction / schema / blocked upgrade | Browser failures preserve memory and visible Recovery unavailable; no local-durability claim; server still stores exact text version 1; no reset/deletion |
| Failed logout / local-only truth | Server unavailable, pending exact record retained, absent server entry, no Saved; logout stays open; Retry later stores writing and removes record |
| Serialized storage and old transactions | Actual IndexedDB tests reject stale revisions, preserve newer content/base after old ack, prevent resurrection via floors, and isolate another writer/scope |
| Multiple IDB connections | Higher revision wins regardless of transaction arrival; direct browser-store assertion |
| Pending identity replacement | Ordinary edit cannot drop/change unresolved mutation; stale explicit supersession denied; exact owner-choice compare-and-supersede succeeds atomically |
| Debounce/max wait, composition, deadlines | Fake timers and request barriers; 1000/5000 ms assertions, no parallel unresolved request per date, IME hold, old ack debt and backward wall-clock change |
| Storage content/schema | Invalid record schema rejected without reset; oversize/NUL draft retained locally; altered explicit discard denied |
| Database integrity/permission races | Real migration/functions, concurrent create, eight concurrent exact retries, historical retry including uppercase UUID, stale versions, content-size and empty-row checks |

Tests use only synthetic identities and writing, with a loopback test mail sink. Auth traces remain disabled. No real emails were sent.

## Visual and accessibility evidence

Actual local production-build screenshots with disposable data:

- [Desktop Sakura](../artifacts/phase-6/diary-desktop-sakura-pink.png), [390 px](../artifacts/phase-6/diary-mobile-390-sakura-pink.png), [320 px](../artifacts/phase-6/diary-mobile-320-sakura-pink.png).
- [Dreamy Sky](../artifacts/phase-6/diary-desktop-dreamy-sky.png), [Lavender Dreams](../artifacts/phase-6/diary-desktop-lavender-dreams.png), [Vintage Journal](../artifacts/phase-6/diary-desktop-vintage-journal.png).
- [Conflict desktop](../artifacts/phase-6/conflict-chromium.png), [conflict 320 px](../artifacts/phase-6/conflict-mobile-chromium.png), [conflict 390 px](../artifacts/phase-6/conflict-mobile-390.png).
- [Recovery unavailable](../artifacts/phase-6/recovery-unavailable-chromium.png), [320 px](../artifacts/phase-6/recovery-unavailable-mobile-chromium.png), [390 px](../artifacts/phase-6/recovery-unavailable-mobile-390.png).
- [Reauthentication gate](../artifacts/phase-6/reauthentication.png), [before](../artifacts/phase-6/editing-before-reauthentication.png), [after](../artifacts/phase-6/editing-after-reauthentication.png). Login/recovery captures also remain in the Phase 6 artifact folder.

Comparison uses approved Phase 5 captures (which retained the approved Phase 4/2 geometry), same CSS-pixel capture sizes and blank initial paper. All six paper/editor measurements and 44/34 px rule spacing match; no overflow. Header/paper pixels are identical for the three other desktop themes. Sakura differs at 13 desktop, 36 mobile-390 and 31 mobile-320 illustration-edge pixels, maximum 2/255 channel difference. The footer is intentionally excluded from pixel equality because it now displays real save/recovery status. [Numerical comparison](../artifacts/phase-6/visual-comparison.json) and layout JSON record the measurements. Images were inspected directly; no diary redesign was introduced.

## Files, security and limits

Inventory: **24 modified, 40 created, zero deleted, zero staged**. Complete created/modified inventory: [`file-manifest.json`](../artifacts/phase-6/file-manifest.json). No files deleted. Primary changes are the new migration/API/controller/store/HTTP adapter/status UI, minimal workspace/session/navigation/logout integration, fixture/CI/client scanner changes, tests and this evidence. The approved PRD and implementation plans, Phase 1–5 visual assets and auth schema were not modified. README was refreshed because its active instructions still described the Phase 4 volatile preview and suggested production Neon setup; it now points to isolated verification and the separate production gates.

[`security-audit.json`](../artifacts/phase-6/security-audit.json) records the final secret scan. Runtime credentials/pools remain server-only. Client output excludes configured credentials. Internal owner UUIDs are not public session/entry response fields. All entry operations independently authorize; origin checks and private/no-store headers remain. Effective SQL privilege tests fail closed; no auth/provisioning connection fallback or permission repair exists. Production private configuration is ignored and untouched.

Known limits: IndexedDB eviction/clearing, origin/profile changes or a crash before transaction commit can lose local writing; strict commit is not a backup guarantee. A background/suspended browser or an in-flight request can delay timers; there is no concurrent save bypass, guaranteed unload flush or offline-first system. Server failures use explicit Retry or safe reauthentication, not a retry storm. Same-origin script/device access is outside application-scope isolation; recovery is not encrypted at rest. Mutation history and local revision floors need a separately reviewed safe retention policy. Production Neon-version rehearsal, migrations, restricted LOGIN/secret provisioning, rollout and real-device/Safari checks remain separate gates. None were executed.

Stop here for owner review. Do not commit/push/deploy/provision production or begin Phase 7 without separate explicit authorization.
