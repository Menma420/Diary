# Dear Diary

Private, single-owner plain-text diary built with Next.js App Router, strict TypeScript, CSS Modules, Zod, Neon PostgreSQL and self-managed Better Auth. The approved Sakura paper, four themes, compact navigation, native textarea and mobile layout remain. Dates display, accept input and route as **DD/MM/YYYY**, for example `/diary/01/11/2026`; internal calendar values remain `YYYY-MM-DD`. Today uses Asia/Kolkata. Supported calendar dates span years 0001–9999, with strict Gregorian validation.

Phases 1–6 are the accepted baseline. Phase 7 persisted themes and timezone are implemented **locally for owner review**. Production migrations, configuration, owner operations, deployment, commit and push require separate approval. Phase 8 has not started. Approved source plans are in `documents/`; later owner decisions retain Neon/Better Auth rather than the original Supabase proposal.

- [Phase 7 preferences contract](docs/phase-7-preferences.md)
- [Phase 7 handoff](docs/phase-7-report.md)
- [Phase 6 handoff and verification](docs/phase-6-report.md)
- [Persistence, API, recovery and operational contracts](docs/phase-6-persistence-and-recovery.md)
- [Phase 5 authentication handoff](docs/phase-5-report.md)
- [Phase 5 owner operations](docs/phase-5-owner-operations.md)
- [Historical Neon setup evidence](docs/neon-setup-report.md)

## Behavior and boundaries

Each owner/calendar-date pair has one versioned PostgreSQL entry. Clearing writing retains an empty entry. Server writes compare versions atomically; exact mutation retries are idempotent. The controller debounces 1000 ms with a 5000 ms maximum wait when dispatch is possible, delaying during IME composition and keeping outgoing dates' saves alive. A delayed acknowledgement cannot replace or certify newer text.

IndexedDB preserves unresolved writing by opaque owner workspace scope, date and writer UUID. Startup and same-owner reauthentication read fresh server versions for all affected dates/writers. Conflicts keep both versions until an explicit choice. Schema, quota, blocked-upgrade and transaction failures are visible; the app never resets storage to repair it. Device recovery and server confirmation have separate indicators. Browser eviction or a crash before transaction commit can still lose local writing.

Authentication remains email/password, closed registration, one operator-bound verified owner and database-backed sessions lasting at most seven days. Every private server operation independently resolves the owner. Public signup is disabled; no browser-supplied identity is trusted. Session expiry retains/locks the mounted editor; same-owner login resumes safely. Explicit logout attempts to flush and stays open if writing remains unresolved.

All four themes and the configured IANA timezone persist independently through versioned owner preferences. Initial authenticated rendering uses the server theme. Settings feedback and conflicts remain separate from diary saves. Temporary original corner SVGs remain; asset finalization/deterministic theme/date arrangements are later scope. No rich text, uploads, shuffle, search, moods, analytics, collaboration or offline-first platform is included.

## Local setup

Use Node **24.22.1** (`.nvmrc` / `.node-version`) and pnpm **12.8.1** (`packageManager`):

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@12.8.1 --activate
pnpm install --frozen-lockfile
cp -n .env.example .env.local
pnpm env:check
```

Preserve an existing `.env.local`; never replace it with examples or commit it. Match `APP_ORIGIN` to the exact browser origin. `pnpm dev` binds to loopback, normally port 3000. A rendered login page alone does not establish an authenticated test environment. Private diary operations fail closed until reviewed auth and diary schemas, restricted connections and a synthetic local owner fixture are configured. Do not point development/test mutations at production.

For automated end-to-end use, the commands below create their **own disposable loopback TLS PostgreSQL databases, restricted roles, synthetic identities and local mail sink**, then clean up. They do not consume a production database connection. The browser fixture starts the production Next server on port 3100; do not run another server there at the same time.

## Verification

Install PostgreSQL server binaries and OpenSSL locally for disposable fixtures. The fixture discovers `/usr/lib/postgresql/*/bin`, or accepts `DIARY_TEST_PG_BIN`. An extracted binary distribution may also need its libraries on `LD_LIBRARY_PATH`. It never attaches to an existing database. Do not run fixtures as root.

```sh
pnpm install --frozen-lockfile
pnpm tokens:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:auth
pnpm test:diary
pnpm test:preferences
pnpm build
pnpm check:client
pnpm exec playwright install chromium
pnpm test:e2e
```

CI installs browser system dependencies, PostgreSQL and OpenSSL too. `typecheck` generates Next route types, then runs strict tsc. Unit/component tests use Vitest/Testing Library. PostgreSQL suites run the actual migrations and controlled functions, including negative privilege and concurrent mutation tests. Playwright uses the local production build at desktop and 320/390 px Chromium viewports, with real IndexedDB, auth, request barriers and accessibility checks. Auth traces remain disabled. These are not Safari or real-device claims.

CI uses synthetic environment sentinels and disposable fixtures. No production secrets belong in CI. `pnpm check:client` scans static browser assets and prerendered HTML/RSC for configured credential values and known sentinels. Production builds do not replace lint/type/tests and perform no database query during prerendering.

## Server environment

All values are server-only; do not use `NEXT_PUBLIC_*` for credentials. Examples in `.env.example` are comments, not live values.

| Variable | Purpose and requirement |
| --- | --- |
| `APP_ORIGIN` | Required exact trusted HTTP(S) origin; HTTPS outside loopback. Needed at build/render and runtime. |
| `DEFAULT_TIMEZONE` | Valid IANA timezone; defaults to Asia/Kolkata. |
| `AUTH_DATABASE_URL` | Auth-only restricted pooled verified-TLS connection; required when auth runs, never falls back to the provisioning URL. |
| `BETTER_AUTH_SECRET` | Independent random server signing secret; required for auth. |
| `AUTH_DERIVATION_SECRET` | Stable independent canonical base64url encoding of 32 random bytes; required for keyed rate limits/workspace pseudonyms. Rotation requires the documented maintenance/recovery procedure. |
| `DIARY_DATABASE_URL` | Phase 6 separate restricted pooled verified-TLS connection, inheriting only `diary_entry_runtime`; required for entry operations, lazy/not a build prerequisite. No AUTH/provisioning fallback. |
| `AUTH_MAIL_MODE` | `unconfigured` by default; `sink` only in wholly loopback fixtures; `brevo` only with separately approved real delivery configuration. |
| `AUTH_MAIL_SINK_URL` | Loopback test sink URL when sink mode is selected. |
| `BREVO_API_KEY`, `AUTH_MAIL_FROM` | Conditionally required for Brevo mode; server credential and verified sender. Never use real delivery in tests. |
| `DATABASE_URL` | Separate existing connectivity health probe only. Never used for diary/auth fallback. Keep privileged operator credentials off application hosts. |
| `DATABASE_URL_UNPOOLED` | Operator/migration connection, unused by app diary/auth operations. Never browser-accessible or a runtime substitute. |
| `NEON_BRANCH` | Historical Neon CLI branch metadata; not an identity or permission boundary. |

The legacy Phase 1 Supabase environment validators/sentinels are retained for regression compatibility, not wired into the approved Neon/Better Auth runtime. A partial legacy configuration still fails validation. Error messages name fields without printing values.

## Migrations and production

Auth migrations live in `migrations/auth/`; diary migrations are `migrations/diary/001_entries.sql` and Phase 7 `migrations/diary/002_preferences.sql`. They are not applied at startup, during builds or by tests against production. `AUTH_DATABASE_URL` and `DIARY_DATABASE_URL` must have separate least-privileged LOGIN principals. Runtime checks inspect effective privileges and reject operator connections, ownership changes, DDL and inappropriate cross-service capabilities.

Existing `.neon` project context and `.env.local` are ignored and must stay local. Do not run `neon deploy`, apply production SQL, change hosted secrets, provision accounts or deploy the frontend as part of local Phase 6 verification. The [Phase 6 operational checklist](docs/phase-6-persistence-and-recovery.md) covers future separately authorized migration/role setup, backup/rollback and retention considerations. Never drop server history or reset IndexedDB as an automatic repair.
