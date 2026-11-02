# Phase 7 — preferences contract and operations

Local implementation only. Production migration, roles, credentials, data, email and frontend deployment require separate approval. Existing Phase 6 autosave and IndexedDB implementations are unchanged. No preference data is written into entry mutations or recovery records. Approved plans remain unchanged.

## Data and security

Migration `migrations/diary/002_preferences.sql`, applied after the reviewed auth migrations and diary 001, creates:

- `diary.preferences`: owner UUID primary/foreign key, approved theme, IANA timezone, bounded positive version, last mutation UUID, creation/update timestamps. The default values are Sakura Pink and Asia/Kolkata. A missing row reads as those defaults with version 0 and null receipt/timestamps; reads do not create rows.
- `diary.preference_mutations`: owner/mutation UUID primary key, exact theme/timezone/base, nullable committed version and acknowledgement timestamp. Conflicted IDs remain reserved. Committed receipts remain valid after subsequent updates. This is independent of `diary.entries` and its mutation ledger.

Both tables belong to existing NOLOGIN `diary_data_owner`, with enabled and forced owner RLS. Runtime has no direct table/column grants. Only `read_preferences(uuid)` and `write_preferences(uuid,text,text,bigint,uuid)` are executable by existing `diary_entry_runtime`; auth and PUBLIC have no access. Both are owner-checked SECURITY DEFINER functions with qualified objects and fixed `search_path=pg_catalog, pg_temp`. They set transaction-local owner context themselves. A separate owner advisory-lock namespace (seed 7 rather than entry seed 6) makes first creation, receipt checks and updates atomic without sharing entry mutation state.

Theme has a table CHECK as well as function/API validation. A trigger validates table timezone writes against PostgreSQL's installed IANA catalog. The controlled write function validates it too. Zod validates exact approved theme IDs, bounded versions, UUIDs, field sets and IANA identifiers using ICU `Intl.DateTimeFormat`, reusing the existing timezone validator. Offset strings and invalid zones are rejected. Supported aliases must exist in both ICU and the database catalog; a catalog mismatch is rejected, never silently normalized or substituted. Calendar dates are never converted or renamed.

The existing server-only `DIARY_DATABASE_URL` and verified-TLS pool are reused. There is no new variable, credential, driver or dependency, and no auth/operator fallback. Effective guards now also verify preference function permissions/ownership/search paths, reject direct privileges on the new tables, and reject preference capability on the auth runtime. `VerifiedOwner` is always resolved independently by each API operation. PATCH authorizes again after bounded parsing. Client identity fields are rejected. Private/no-store responses, origin/Fetch Metadata checks, sanitized errors, cookie/CSRF/CSP policies and closed signup remain. No settings payload, diary content, credentials or internal owner UUID is logged or emitted in public preference DTOs.

## API

`GET /api/preferences`: 200 `{kind:'loaded',preferences:{theme,timezone,version,lastMutationId,createdAt,updatedAt}}`. Missing row means approved defaults/version 0. An unsupported legacy theme adds `repairRequired:true`, with Sakura preview and the original version/receipt metadata, until an explicit repair. PATCH does not accept this response-only flag. Database/read failure is 503, never an invented default row.

`PATCH /api/preferences`: JSON exactly `{theme,timezone,baseVersion,mutationId}`. Both values are required. Requests are bounded to 4096 bytes without trusting Content-Length. A successful update returns 200 `{kind:'acknowledged',acknowledgement:{version,mutationId,updatedAt}}`; version must equal base+1. A conflict returns 409 `{kind:'conflict',current:preferences}`. Invalid/reused mutations return 400; unauthenticated/forbidden sessions 401/403; unavailable services 503. Responses are sanitized and private/no-store.

Same ID plus exact values/base returns the original acknowledgement. Reuse with changed values/base is rejected, including IDs from failed CAS attempts. Concurrent first writes produce one row and one conflict. There is no last-writer-wins update, diary-entry version change or owner rebind.

## Rendering and controller

The root server layout and diary layout share `ownerPresentation()` through React's request-scoped RSC cache. This deduplicates the same request's authoritative owner/preference read; it is not a process-global identity cache. Each later operation independently authorizes. Root HTML carries the persisted `data-theme` before authenticated paint. DiarySession initializes from that same server snapshot and applies the root attribute in a layout effect for client-side login/navigation, before paint. Root/authenticated routes are dynamic and private. No theme cookie, inline bypass script or browser preference storage is introduced.

On an initial preference read failure the private diary does not paint with an assumed Sakura default. A visible retry is offered. On later failures the mounted editor remains, with its content and prior/current appearance preserved. An unsupported legacy stored theme previews Sakura with a visible repair notice and preserves the actual version/receipt metadata. The owner can explicitly save a version-checked Sakura repair. Other malformed data remains a failed read; no version or timezone is invented. The new database constraint prevents unsupported themes through normal writes.

`PreferenceController` is separate from EditorWorkspace, SaveController and IndexedRecovery. It holds desired values, authoritative snapshot, a local selection revision and at most one immutable unresolved mutation. Selections update immediately. Requests serialize. An old acknowledgement updates only the authoritative base; it cannot replace a newer deliberate selection. A fresh read verifies every receipt before Saved or the next write, detecting historical acknowledgements after another session advanced.

An uncertain/failed write retains its exact ID/values/base in memory. Retry resends it, then sends any newer selection with a new ID against the confirmed base. Conflicts keep local choices visible alongside fresh server choices. Keep my settings and Use server settings both check the displayed version again; another advance requires renewed review. A newer selection invalidates an older read or conflict-choice callback. No preference callback focuses, scrolls, changes dates, writes entries or touches IndexedDB.

Feedback states are independent: Loading settings, Settings up to date, Settings not saved, Saving settings, Settings saved, Settings save failed Settings conflict and Stored theme needs repair. A failed preference write never changes entry SaveStatus. Focus/pageshow restoration reads fresh preferences. Session denial pauses preference writes and locks the existing owner workspace; same-owner reauthentication reconciles before retry. Another identity cannot unlock it.

## Settings and date behavior

The existing palette control remains in its original header position. The compact Settings control sits beside Sign out. Its native modal supplies four named radio previews, current selection, an IANA field, validation and explicit timezone application. Keyboard close restores the trigger; opening from active writing restores the same textarea, selection direction and scroll. Async preference completions do not perform focus restoration. Session lock closes the settings modal so it cannot obstruct reauthentication.

Today in the header/calendar uses the current configured timezone on each action. `/` and `/diary` calculate Today from authoritative persisted preferences. Changing timezone never navigates or reinterprets an existing URL/date/row. Routes remain DD/MM/YYYY. Theme/timezone changes do not change editor component keys, content, sessions, selection, IME state, pending entry mutations, conflicts, timers or recovery records.

## Operations, rollback and limits

Rehearse migration 002 and guards on an isolated Neon branch using the intended production PostgreSQL version before rollout. Current evidence uses independent local TLS PostgreSQL 14.24 clusters with synthetic owners and a loopback mail sink; no production Neon connection is used. Obtain separate approval for migration and deployment. Apply the reviewed migration before deploying code that expects its functions. No automatic migration or privilege repair runs on app startup/build.

For rollback, drain preference requests and preserve preference rows/receipts. Prefer application rollback or a reviewed forward fix. Do not drop diary entries, receipts, roles or IndexedDB. Any grant revocation, schema removal or restore needs separate authorization and a backup/retry-safety plan. A previous Phase 6 application ignores preference data. No irreversible down migration is supplied.

Preferences intentionally have no IndexedDB recovery subsystem. Unconfirmed choices and exact pending preference identity live only in the mounted workspace; reload/close can lose an uncommitted choice. Confirm Settings saved before leaving when persistence matters. Reads on focus are event-driven, not live cross-tab synchronization. Mutation history retention needs a future reviewed policy preserving exact retries. ICU/PostgreSQL timezone catalogs can differ. Chromium evidence does not establish Safari, real-device keyboard behavior or production readiness. Phase 8 is not started.
