# Dear Diary — Phase 5 local implementation handoff

Owner review build, 1 November 2026. Updated after final owner security review; see [resolved review points](./phase-5-security-review.md). Base: `main` at `1fa865fbfd628837aea79742e4d3bd69ca1712a7`.

Phase 5 adds self-managed Better Auth authentication and verified singleton ownership. It preserves the approved editor/domain code, four themes, DD/MM/YYYY routing and Kolkata date handling. The owner has approved GitHub publication. This report records the final pre-publication verification; the exact pushed commit and remote CI result are reported separately after publication. No frontend deployment, production migration, real-owner provisioning or Phase 6 work has been performed.

## Architecture and flow

`auth.server.ts` owns the lazy server-only auth pool/configuration and authorization boundary. It shares the existing verified-TLS, bounded Node `pg` policy, but requires an explicit, separately restricted `AUTH_DATABASE_URL`. It never falls back to the existing Neon provisioning connection. Configuration/connections are cached; identities, sessions and owner mappings are not.

`createDiaryAuth` pins the reviewed Better Auth configuration. Public signup is disabled in the library, user creation is denied by a hook and the runtime lacks user/account INSERT privileges. Session creation is allowed only for the verified bound owner. Social/anonymous login, linking, deletion, identity changes, administrative plugins and public account creation are absent or disabled. The app does not expose the library's whole handler surface.

The HTTP gateway accepts same-origin JSON POSTs for exactly six operations: `sign-in/email`, `sign-out`, `request-password-reset`, `reset-password`, `send-verification-email` and `verify-email`. Everything else, including the library's public session JSON endpoint, is denied. Strict bounded schemas reject caller-supplied identity/callback fields. The gateway retains native origin/CSRF checks, forwards required Set-Cookie headers, and replaces native token/user/error/redirect payloads with minimal success or sanitized failure JSON. Email verification is a POST externally; only the gateway converts it to the library's internal GET handler. No token-bearing outbound redirect is forwarded.

`ownerResult()` reads the authoritative database-backed session with cookie caching disabled, checks expiry and verified email, and resolves the opaque auth user ID through the private binding. It rejects malformed, excessive-lifetime, expired, revoked, missing and mismatched identities. `requireOwner()` wraps the same boundary and returns an immutable branded `VerifiedOwner` containing only internal owner UUID and expiry. The brand is API assistance; runtime database checks establish authorization.

The index pages authorize before redirecting to Kolkata Today. The dated server page independently authorizes near rendering and passes a minimal gate result. The layout also checks but is not the sole boundary. `/api/session` independently checks and exposes only status, an opaque HMAC workspace identifier, expiry and a server check timestamp. It exposes no auth user ID, email, token or cookie. The existing PostgreSQL health operation now independently authorizes and still hides database identity/raw errors.

Anonymous dated visits show only the login gate and do not mount `DiarySession`/`EditorWorkspace`. Anonymous index visits go to `/login`. A previously authorized client workspace stays mounted under its stable opaque workspace identifier when the session locks. Its paper becomes hidden, inert and read-only, and same-origin reauthentication appears in place. A different identity cannot unlock or receive that workspace. Same-owner login retains the original textarea node, draft, date, backward selection and document scroll. Navigation's cached RSC results cannot unlock a locked workspace or extend its session timer.

Database sessions expire absolutely after at most 604800 seconds, without rolling refresh. Session hooks clamp the lifetime to the exact limit. UI expiry scheduling uses the remaining lifetime calculated from server timestamps, avoiding dependence on the device's calendar clock. Live no-store session checks run on window focus and restored bfcache pages; there is no continuous polling. Every protected server operation remains independently authoritative.

Logout uses a native accessible confirmation dialog, warns that all writing remains unsaved, and permits cancellation or deliberate discard. Failed logout retains writing and reports that sign-out was not confirmed. The footer continues to say **Preview · not saved**. No auth state is added to editor domain contracts, controllers or workspace documents.

## Database and migration review

- `001_better_auth_1_7_15.sql` was generated using the exact pinned library's `getMigrations` against an empty disposable database. It creates users, credential accounts, sessions, verification records and library indexes.
- `002_owner_and_limits.sql` creates private singleton ownership and durable rate-limit tables, plus a restricted NOLOGIN runtime group. Binding constraints include a true-only singleton primary key, unique immutable owner UUID, unique auth user ID and a restrictive FK.
- Auth user/account records are operator-provisioned. The runtime can update only the specific verification/password/timestamp columns needed by native flows. It cannot insert/delete users, insert accounts, change email/IDs, modify the binding or create public/private schema objects.
- Runtime startup/request checks reject superuser, create-role, create-database, BYPASSRLS, public/private schema CREATE and owner-binding mutation/user-creation capabilities. Permission revocations name only auth tables. Schema/database PUBLIC permissions still need operator review before any production application, especially on a shared database.
- The local read-only Neon capability inspection found the existing connection had create-database, create-role, BYPASSRLS and public schema CREATE capabilities. It must **not** be used as the auth runtime connection. No identity or credential values were printed, and no production changes were made.
- Migrations ran only in disposable loopback PostgreSQL 14.24 clusters, using verified TLS and separate operator/runtime roles. The pinned library's post-migration schema diff is empty. Production Neon migration execution remains separately gated.

There are exactly six application auth tables in the fixture: `auth_user`, `auth_account`, `auth_session`, `auth_verification`, `private.diary_owner`, `private.auth_rate_limit`. No diary entry/preferences tables, Supabase auth assumptions or `auth.uid()` policies were introduced.

## Environment and dependency changes

Only one new direct dependency: **`better-auth` exactly `1.7.15`**. Existing Next 16.4.3, React 19.3.1, pg 8.23.1 and other direct pins remain unchanged. Declared peers include Next 16, React 19 and pg 8; strict compilation and production tests confirmed this configuration locally. pnpm added version-specific minimum-release-age exceptions for this exact Better Auth release and its bundled adapter/core/telemetry packages; there is no broad policy bypass. Telemetry is disabled in configuration.

Server variables are documented in `.env.example`:

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Exact trusted HTTPS origin; loopback HTTP allowed for local work |
| `DEFAULT_TIMEZONE` | Asia/Kolkata default, unchanged |
| `AUTH_DATABASE_URL` | Separate least-privileged auth role, verified TLS |
| `BETTER_AUTH_SECRET` | Random signing secret, at least 32 characters; no default |
| `AUTH_DERIVATION_SECRET` | Independent canonical base64url of 32 random bytes; domain-separated rate/workspace derivations |
| `AUTH_MAIL_MODE` | `unconfigured` by default, `brevo`, or restricted test-only `sink` |
| `BREVO_API_KEY`, `AUTH_MAIL_FROM` | Server-only transactional key and verified sender |
| `AUTH_MAIL_SINK_URL` | Loopback synthetic mail sink; requires loopback app and database |
| Existing `DATABASE_URL` variables | Prior Neon connectivity boundary; not an auth fallback |

The Phase 1 legacy Supabase integration-validation helpers/tests remain for compatibility; they do not authenticate, authorize or configure the new auth service. No Supabase client/provider has been introduced. Leave their legacy variables unset for the new stack. Current authentication validates its own strict environment at the server boundary. `.env.local` remains ignored and mode 0600; `.neon` remains ignored; neither is staged/tracked. No real auth environment or email credentials were added.

## Email, recovery and security

Brevo is the conditional free transactional-mail adapter, implemented with native server fetch, without an additional email SDK. Its [official free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) document a non-expiring free plan with 300 emails/day; its [transactional API](https://developers.brevo.com/docs/send-a-transactional-email) supports reset messages. [Pricing](https://www.brevo.com/pricing/) documents the free option. The app adds a much lower 20-email/day ceiling. No plan/account was activated, no domain purchased and no real email sent. A verified sender, current free-tier eligibility and actual delivery testing remain production prerequisites. An existing suitable sender/domain must fit the ₹0 additional budget.

The sink adapter sends only synthetic messages to a loopback-only test service. Reset and verification URLs use the fixed trusted app origin and place tokens in fragments. The client removes the fragment and submits a JSON POST; tokens are never put into rendered HTML/RSC or HTTP query redirects. Password reset is restricted to the existing verified owner, expires after 30 minutes, consumes a single-use hashed verification identifier, updates the existing credential and revokes sessions in the library transaction. Concurrent replay permits exactly one success. Email verification uses the pinned library's signed 30-minute JWT; completion is idempotent on replay and never creates a session/account or changes ownership.

Durable HMAC-keyed PostgreSQL UPSERT limits are atomic under concurrency. HKDF separates rate and workspace keys from an independent derivation root; signing-key rotation preserves counters. Exact normalization, persisted metadata and closed-ingress derivation-root rotation are documented in the security review. They cover native operation/IP limits, gateway IP and global operation limits, per-destination attempts and daily mail. Arbitrary forwarded headers are ignored. Only a validated Vercel-overwritten client address is recognized when the trusted runtime identifies itself as Vercel; otherwise requests share a conservative bucket. Mapping, session, role-check and limiter failures deny access. There is no memory fallback.

Production cookies are HttpOnly, Secure, SameSite Lax, host-only, Path `/`, with explicit seven-day Max-Age. There is no cookie payload cache, browser-accessible session JSON token, local auth storage, bearer-token override or cross-subdomain cookie. Library logs are disabled; errors are sanitized. Playwright traces are disabled because they can record auth bodies/cookies.

The response proxy supplies per-request CSP nonces, production script policy without unsafe-eval, no objects/framing, same-origin forms/connections, no-referrer, nosniff, noindex and private/no-store policies. HSTS applies on HTTPS. Inline styles remain permitted because the existing textarea uses measured inline height; no unsafe-inline scripts are allowed. The proxy does not authorize pages. A real-host TLS/cookie/IP review remains necessary before deployment.

The separate [owner operations runbook](./phase-5-owner-operations.md) describes first provisioning, out-of-band operator recovery, revocation, stable UUID preservation and value-free audit records. It is documentation, not a public bootstrap/admin feature.

## Verification

Final local results and evidence are recorded in `artifacts/phase-5/verification.json` and `visual-comparison.json`. No earlier handoff results are substituted for these runs.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged by installation |
| `pnpm tokens:check` | Passed; approved generated CSS matches canonical tokens |
| `pnpm lint` | Passed, zero warnings |
| `pnpm typecheck` | Passed: Next route generation and strict TypeScript |
| `pnpm test` | 148/148 passed in 10 files; includes all 123 earlier unit/component regressions plus 25 auth cases |
| `pnpm test:auth` | 13/13 passed on disposable TLS PostgreSQL: migration parity, constraints, runtime permissions, concurrency, failure denial and native-library signup denial |
| `pnpm build` | Production build passed; private/auth routes dynamic |
| `pnpm check:client` | Passed, 28 public assets/payloads; real configured database credentials plus synthetic signing/derivation/email secret sentinels checked without printing them |
| `pnpm test:e2e` | 108/108 passed, no skipped tests: existing 60 regressions plus 48 Phase 5 cases across desktop/320/390 |
| Accessibility | Embedded axe WCAG A/AA scans passed on login, recovery/reset/verification, logout, calendar and all four diary themes; keyboard, focus, reflow and overflow checks passed |
| Git whitespace audit | `git diff --check` passed |
| Private-value file scan | Passed on tracked/untracked review files, including reports and PNGs; configured values withheld |

Authentication cases cover correct owner, wrong password, unverified account, expired/revoked session, missing binding, second signed-in identity, forged cookie, database outage, CSRF/origin, closed signup, restricted endpoints, cookie policy, native signup denial, rate-limit concurrency/spoofing/outage, reset expiry/replay/concurrency/revocation, verification, anonymous editor exclusion, automatic expiry lock, same-owner restoration, different-identity lock, logout cancellation/discard and password-manager semantics.

The final screenshots use the prior Phase 4 capture's DPR-1 CSS-pixel convention for comparison. Mobile behavior tests additionally run Pixel device emulation at 320 and 390 px. Review views include login at three sizes, diary at three sizes and all four desktop themes, recovery, and writing before/during/after reauthentication. The actual images are embedded in the visual review gallery. The new footer Sign out action is the intentional diary UI addition. Paper geometry, editor bounds, rule spacing and overflow exactly match all six Phase 4 views. Header/paper pixels match exactly for the three other desktop themes. Desktop Sakura has 13 differing illustration-edge pixels, 320 px Sakura has 31, and 390 px Sakura has 36; the maximum difference is 2/255 per channel, consistent with rasterization variation. The footer is excluded from that pixel comparison because it contains Sign out. Full numerical evidence is in the artifact.

CI was updated to install disposable PostgreSQL tools and run the new database/browser fixtures without production secrets. **Remote CI is pending publication at this report snapshot.** The final owner handoff must verify the workflow against the exact pushed SHA. Earlier compatibility/label/timing test failures were corrected before the final passing runs; the obsolete browser run was stopped before the final unchanged production test run.

## Review files and remaining gates

`artifacts/phase-5/file-manifest.json` contains the complete created/modified file list. No files were deleted. Existing approved PRD/plans and Phase 1–4 evidence were not modified. The pre-existing Phase 5 architecture proposal is included unchanged in the publication.

Remaining production gates: owner email and explicit provisioning approval; reviewed production migration/least-privileged LOGIN role; trusted HTTPS origin/host header policy; suitable verified free sender/API credentials and real delivery tests; production operational monitoring/cleanup. Rate-limit buckets and expired auth records need operator maintenance as documented; no cron or extra service was activated. Unrecognized hosting platforms intentionally use shared IP limiting until a trusted adapter is reviewed.

Writing still exists only in the mounted tab. Refresh, close or deliberate logout loses it. There is no production owner, auth-schema application or live recovery-delivery claim. No diary persistence, autosave, IndexedDB, offline sync, rich-text changes, new themes or Phase 6 functionality was implemented. GitHub publication is authorized; provisioning, production migrations, deployment and the next phase still require separate owner authorization.
