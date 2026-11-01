# Phase 6 — persistence and recovery contracts

This document describes the local implementation. It does not authorize production migrations, credentials, owner operations, email delivery or deployment. The approved PRD/plans are unchanged. The current owner's Phase 6 instructions control the older plan's Supabase paths and preference-table references: Neon/Better Auth remain; preferences are Phase 7.

## Boundaries

`EditorWorkspace` still owns plain text, per-date editing sessions, selection/direction, document scroll, composition and revision. Its observers expose edits to `SaveController`; acknowledgements update the baseline without replacing the current document. Explicit conflict choices and initial reads may hydrate documents. UI components own rendering/input, not SQL.

`SaveController` belongs to one mounted authenticated workspace, independent of date and theme. Each date has one unresolved immutable mutation and an independent timer/request. `EntryPersistence` is implemented by `HttpEntries`; `RecoveryStorage` by `IndexedRecovery`. No global identity cache, browser database credentials, localStorage, sessionStorage, service worker, offline queue framework or dependency was added.

The browser uses the existing `w1_` HMAC workspace pseudonym solely as a recovery namespace/equality marker. Internal owner UUIDs remain server-side. This pseudonym does not authorize API calls. All entry requests independently resolve the authoritative session and singleton owner through `requireOwner()`. PUT checks again after bounded body parsing. A different identity cannot unlock a retained workspace or enumerate it through the application recovery boundary.

## Migration and effective permissions

Reviewed migration: `migrations/diary/001_entries.sql`. It runs in one transaction and creates only diary entries, the exact-mutation ledger, RLS policies, two functions and two NOLOGIN groups. It does not create users, owner bindings or preferences. The local/disposable fixture applies it after auth migrations 001/002.

| Principal | Capability |
| --- | --- |
| Operator/migration | Review/apply SQL through a direct connection; provision restricted LOGIN separately; inspect/backup under separate authorization. Never an application credential. |
| `diary_data_owner` | NOLOGIN, no elevated flags; owns diary schema/tables/functions; SELECT on private singleton binding only. Forced RLS applies even to the table owner. Never granted to runtime principals. |
| `diary_entry_runtime` | NOLOGIN capability group; schema USAGE, EXECUTE only on the two reviewed entry functions; separately grant CONNECT to the actual restricted LOGIN. No table/column grants, auth access, owner binding access or changes, DDL or grant options. |
| Existing auth runtime | Existing auth-only grants. Entry functions and diary tables remain unavailable. The auth guard now also rejects accidental entry-function capability. |

`DIARY_DATABASE_URL` is mandatory when an authenticated entry operation runs, lazy/server-only, verified TLS and pooled with the existing `pg` configuration. There is no fallback. Identical auth/provisioning URLs are refused; effective privilege checks also reject privileged connections even if differently spelled. The guard rejects elevated/SET ROLE-reachable memberships, database/schema CREATE, direct table/column capabilities, unsafe table ownership/RLS, function grant options or unexpected function ownership/search paths.

`diary.entries` has primary key `(owner_id,entry_date)`, an owner foreign key, PostgreSQL `date` restricted to years 0001–9999, UTF-8 content ≤262144 bytes, positive safe-integer version, last mutation UUID and creation/update timestamps. Explicit clears update content to `''`; rows are retained. No timestamp conversion determines calendar identity.

`diary.mutations` retains exact valid requests and committed acknowledgements, unique by owner/mutation UUID. This permits idempotency even after a later write. Conflicted requests retain a reserved receipt with NULL committed version; exact retry remains a conflict against fresh current state, and changed reuse is rejected even when the original CAS was rejected. Changed date/base/content under the same UUID is rejected. History contains private writing and must receive the same backup/access/retention protection as entries. No automatic pruning is implemented: removing receipts would weaken old retry guarantees.

Both functions are SECURITY DEFINER owned by the non-login, non-BYPASSRLS data role, with fixed `search_path=pg_catalog, pg_temp`. Object references are qualified. Each verifies the singleton owner and sets transaction-local RLS context itself. `write_entry` holds a transaction-scoped advisory lock for this owner's writes, checks the receipt first, compares the current version, and updates the entry plus receipt atomically. The owner-wide lock deliberately serializes this small single-owner workload, including cross-date UUID reuse and concurrent creation. Hash collisions serialize unnecessarily rather than bypass checks. No session-level state is assumed through pooled connections.

### Safe future production checklist — not executed

1. Obtain separate owner approval for target branch, migration, runtime LOGIN and secret configuration. Keep real account/email and binding unchanged.
2. Review the SQL, existing PUBLIC/inherited/default grants, data ownership, Neon role-creation/ownership capabilities, backup/restore procedure and unpooled operator connection. Rehearse on an isolated Neon branch using its actual PostgreSQL version. Current executable evidence uses disposable PostgreSQL 14.24, not the production Neon database.
3. Apply auth prerequisites and diary migration transactionally using the approved operator. Never run migrations on application startup or with the pooled auth/diary runtime connection.
4. Provision a separate restricted LOGIN inheriting only the diary runtime group. Grant CONNECT; no operator/data-owner/auth membership, object ownership, schema CREATE, table/column mutation or grant options. Review PUBLIC database TEMP/CREATE and callable security-definer capabilities.
5. Set only its pooled, verified-TLS connection in server-side `DIARY_DATABASE_URL`, distinct from AUTH/provisioning credentials. Privileged credentials do not belong on the web host. Run positive/negative effective-permission checks before accepting requests.
6. Independently approve rollout and backup/restore evidence. Verify private/no-store responses, auth separation, real browser storage and entry roundtrips. Local checks do not prove production readiness.

Rollback: stop/drain entry writes and preserve server entries, mutation receipts and all unresolved browser drafts. Prefer application rollback to the previous auth-only version or a reviewed forward fix. Revoke entry-runtime EXECUTE/CONNECT only under an approved operational procedure. Do not drop tables/ledger/roles or reset IndexedDB as an automatic rollback: those actions can destroy writing or retry identity. Browser records remain for an approved compatible forward recovery. Database restore may remove later writing and requires separate disaster-recovery approval.

## API

Public path: `GET` / `PUT /api/entries/DD/MM/YYYY`, matching existing diary routes. Wire snapshot dates and internal `CalendarDate` remain the existing strictly validated `YYYY-MM-DD` calendar contract. No URL/date-format change was made. Invalid Gregorian dates/padding are rejected.

GET 200: `{kind:'loaded',entry}`. Missing: `{exists:false,date,content:'',version:0}`. Existing (including empty): `{exists:true,date,content,version,updatedAt,lastMutationId}`. A read error produces a failed result and a locked editor with Retry; it is never interpreted as an untouched date.

PUT JSON: exactly `{content,baseVersion,mutationId}`; extra identity fields are rejected. Content is exact plain text, well-formed Unicode, no NUL, ≤256 KiB UTF-8. Zod uses jitless validation to preserve the strict CSP without unsafe-eval. The bounded stream permits JSON escaping without trusting Content-Length. Outcomes: 200 acknowledged with matching date, mutation UUID, base+1 version and update timestamp; 409 conflict with current snapshot; 400 invalid request or changed UUID reuse; 401/403 denied; 503 sanitized unavailable. Content is returned only as the necessary private entry/conflict payload, never logged. No internal owner UUID is in responses.

PUT requires the exact configured Origin and rejects cross-site Fetch Metadata. Auth is checked independently of proxy/UI. All responses are private/no-store; existing CSP/cookie/noindex controls remain. Runtime pools and credentials are server-only. There is no email call in the entry path.

## Autosave and state semantics

Timing uses monotonic `performance.now()` independently of wall-clock changes. Inactivity: 1000 ms. Maximum wait: 5000 ms during continued input, subject to the prior request/local transaction completing and browser timer execution. New edits retain their timing debt while an older request is unresolved. No concurrent unresolved request for the same date is dispatched. Other dates continue independently. Composition delays dispatch until idle; disconnect finalizes the outgoing composition and retains text.

Each snapshot freezes date, local revision and exact `{content,baseVersion,mutationId}`. The record containing that snapshot is committed before fetch whenever storage is available. If storage fails, memory and server saving continue with a visible Recovery unavailable state. A lost/aborted response remains uncertain: Retry resends the same ID/content/base. After a retry acknowledgement, a fresh read must confirm the entry is still at that committed version; a historical receipt with an advanced current entry preserves both texts as a conflict instead of displaying Saved. Acknowledgement validates all fields; it updates that date's base only. Newer text is never replaced or marked Saved by an older acknowledgement. Position/theme changes do not generate writes.

| UI | Meaning |
| --- | --- |
| Loading diary / Could not load diary | No editable blank fallback; Retry the read. |
| Up to date | Fresh server read, no unresolved local revision. |
| Unsaved changes | Current writing awaits dispatch/confirmation. |
| Saving to server | An exact snapshot is unresolved; later writing may already exist. |
| Saved | Current local revision has a matching server acknowledgement. |
| Draft stored on this device | Current unresolved revision committed to IndexedDB; separate from server status. |
| Recovery unavailable | Device durability cannot be confirmed; retain this tab. Server saving may still succeed. |
| Save failed | Pending identity retained; Retry or address invalid/oversized content. |
| Conflict · review writing | Both local and current server texts retained; editor locked pending deliberate choice. |

Conflicts and failures for non-visible dates are surfaced compactly below the diary. There is no dashboard or polling loop. Autosave does not focus, select or scroll DOM nodes. The approved paper, typography, illustrations, themes and navigation remain. Explicit modal interaction follows native focus behavior.

## IndexedDB v1

Database: `dear-diary-recovery`, integer version 1. Stores:

- `drafts`: composite key `[key.workspaceId,key.date,key.writerId]`, non-unique workspace index.
- `receipts`: same key; acknowledged/discarded revision and base-version floor, without diary content. It prevents a stale queued transaction from resurrecting a removed draft.

Each record has schemaVersion 1, opaque workspace scope, calendar date, writer UUID, exact current text (including server-invalid text), monotonically increasing revision, base server version, updated timestamp, and nullable immutable pending mutation/date/revision/request. A pending revision cannot exceed the draft revision; its base/date must match; equal-revision content must match. Wall-clock timestamps never select a winner.

Writer UUID is generated per mounted browser workspace; the browser profile/origin provides the device boundary. Refresh creates a new writer and enumerates older writers rather than relying on localStorage/sessionStorage. A recovered record is copied under the new writer while the source is retained until exact acknowledgement or an explicit discard. Concurrently changed sources cannot be discarded using a stale copy. Adoption/retirement provenance is explicit: an acknowledgement can retire only its adopted source copy or candidates covered by a deliberate owner choice. A writer discovered during an in-flight request remains unresolved. Editor revisions never decrease within a writer workspace, including after fresh hydration or a server-choice resolution, so acknowledged floors do not reject subsequent edits.

A single promise queue orders operations within a store. Cross-connection readwrite IndexedDB transactions serialize the read/compare/write checks. Revision and acknowledged-base floors reject stale writes even if they arrive late. Equal revision cannot change text or an unresolved snapshot. Ordinary newer edits also cannot replace/drop pending mutation identity. An explicit conflict choice can supersede only the exact complete prior record in the same transaction. Acknowledgement matches the pending identity/revision in one transaction, clears only it, advances the base, and removes a draft only when the latest revision/content is acknowledged. Newer writing remains. Explicit discard compares the complete record structurally, independent of object-key insertion order.

Transactions request strict durability. Quota, blocked upgrade, version/schema, unavailable API, transaction and stale-CAS failures remain visible; no automatic database deletion/reset, schema downgrade, silent memory substitute or local-only Saved claim exists. A blocked open fails visibly without preventing server requests; an eventual upgrade connection closes safely. New/incompatible record schemas remain untouched for a reviewed recovery path.

## Reconciliation and lifecycle

Startup enumerates every unresolved date/writer for the current scope. Each affected date reads fresh server state. Exact pending mutations may be retried against the ledger before deciding whether newer local text is still unresolved. If all local text was already committed and later server text exists, initial loading uses a fresh server read. If newer unresolved text has an advanced base, it remains a conflict. An unchanged base resumes. Multiple writers require a choice; neither latest timestamp nor refresh automatically chooses a winner.

Reauthentication enumerates writers before re-enabling queued writes, refreshes every tracked date, then resumes exact pending writes or unchanged bases. Session denial pauses writes and locks the existing mounted editor. Only the same verified pseudonym unlocks it. Other scopes' records stay intact and are not loaded/rendered by the application. If a confirmed server acknowledgement was followed by a local cleanup failure, a retained record from the current writer is surfaced for fresh-server review on reauthentication rather than silently skipped; deliberate resolution can clean it up without incrementing the server version unnecessarily.

Conflict dialog shows current server text and all preserved local candidates. Keeping the server explicitly discards the listed local records using compare-and-delete transactions. Keeping a local candidate rechecks the displayed server version, captures the chosen candidate and writes against that version with a new UUID; another server advance requires renewed review. Original sources remain until acknowledgement. Choosing one candidate deliberately discards the other listed candidates only as part of the confirmed resolution. Decide later changes nothing. This is not an automatic merge.

Button navigation flushes queued local records before routing. Incoming route activation, including browser history, keeps the outgoing editor mounted until recovery transactions settle. Saves themselves are not canceled by date switches. Explicit logout offers cancellation and tries a server flush; if any date is busy, failed, conflicting or unresolved, logout stays open and preserves writing. A successful flush permits session revocation. Logout does not clear the recovery database.

## Operational limits

Browser storage can be evicted/cleared, denied in privacy modes or lost with the browser profile. A crash before a local transaction commits can lose the newest keystrokes. Strict IndexedDB commit is not a backup guarantee. Browser suspension delays timers; unload delivery is not guaranteed. Server failures are retried deliberately; this is not a full offline-first sync system.

Local records are private to the browser origin/profile and application scope; they are not encrypted against a person with device/devtools access, same-origin malicious script or a compromised browser. The workspace pseudonym is not a cryptographic storage access control. Existing CSP and server authorization remain essential. Use separate profiles on shared devices. No background cross-tab synchronization is claimed; server versions and transactional record checks prevent silent overwrites when tabs meet.

Mutation receipts and local revision floors intentionally retain metadata/history; retention/cleanup needs an approved procedure that preserves unresolved retry safety. There is no automated retention job. Large recovery sets may need retries after service/timeouts; failures for other dates remain visible. Device recovery is origin-specific: moving domains does not migrate browser records. Derivation-root changes alter workspace scopes: export/resolve all writing under a separately approved maintenance process before rotation; never silently reassign old records.

PostgreSQL verification is disposable/local. Chromium covers desktop and 320/390 px; Safari/iOS, real mobile keyboards, eviction behavior and production Neon/Vercel rollout remain separate operational acceptance gates. Phase 7 was not started.
