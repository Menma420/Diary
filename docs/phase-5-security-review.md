# Phase 5 — Final security review and owner acceptance

Accepted security review, prepared for owner-authorized GitHub publication. Base remains `1fa865fbfd628837aea79742e4d3bd69ca1712a7` on `main`. Commit and push are now authorized; frontend deployment, real account provisioning and production migration remain excluded. Remote CI must be verified after publication. The earlier architecture proposal and approved Phase 1–4 plans remain unchanged.

## 1. Internal UUID removed from browser contracts

The browser needs only a stable equality marker to retain the mounted workspace across sessions and refuse a different identity. It does not need the internal ownership key.

`/api/session` and authenticated RSC props now expose only `kind`, `workspaceId`, `expiresAt` and `checkedAt`. The `workspaceId` is a full 256-bit keyed pseudonym with a `w1_` prefix, not a UUID, session token, auth user ID, email, bearer credential or reversible encoding. The internal UUID remains in the server's verified owner context and database binding. The public projection is now server-only. The frontend uses the pseudonym solely for workspace continuity; all server authorization still reads the session and binding independently. Caller-supplied ownership fields remain rejected.

The same owner gets the same pseudonym across reauthentication/restarts while the derivation root remains stable. A different internal owner gets a different pseudonym. The equality marker is correlatable within this one application by design; it must not be reused as an authorization claim or shared across deployments. Tests check UUID/auth-subject absence in session JSON and rendered HTML, stable pseudonyms, same-owner restoration, and a different genuinely verified owner in an operator-controlled disposable fixture. That different identity cannot unlock the original workspace, which remains retained and hidden.

## 2. Exact HMAC construction and normalization

### Source and separation

The previous implementation used `BETTER_AUTH_SECRET` directly for rate keys. It now requires an independent `AUTH_DERIVATION_SECRET`, generated from **32 cryptographically random bytes**, encoded as canonical unpadded base64url (43 characters). There is no fallback to the cookie signing secret or a test constant. Environment validation rejects missing/malformed roots and reuse of the signing secret. Each deployment must have its own root. No root value is included in this report or browser output.

Exact byte-level construction:

```text
R = base64url_decode(AUTH_DERIVATION_SECRET)       // exactly 32 bytes
salt = UTF8("dear-diary/auth-derivations/v1")
K_rate = HKDF-SHA256(R, salt, UTF8("dear-diary/rate-limit/v1"), 32)
K_workspace = HKDF-SHA256(R, salt, UTF8("dear-diary/workspace/v1"), 32)

DB bucket key = lowercase_hex(HMAC-SHA256(K_rate, UTF8(M)))
workspaceId = "w1_" + base64url_no_padding(
  HMAC-SHA256(K_workspace, UTF8(JSON.stringify(["owner", lowercase(internal_owner_uuid)])))
)
```

There is no digest truncation. Fixed HKDF salt/info strings are namespace constants, not secrets. The independent HKDF info values separate workspace identifiers from rate identifiers; JSON arrays separate rate namespaces and fields without delimiter collisions.

The primitive's argument order is documented in [Node's HKDF API](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptohkdfsyncdigest-ikm-salt-info-keylen); the byte constants and rotation policy above are application design decisions tested on the pinned Node 24.22.1 runtime.

`M` is the exact compact JavaScript `JSON.stringify` output for one of these arrays, with no additional whitespace:

| Bucket | Message array |
| --- | --- |
| Native library rule | `["native", nativeKey]` |
| Global endpoint budget | `["gateway-global", operation]` |
| Trusted IP + endpoint | `["gateway-ip", operation, normalizedIP]` |
| Destination attempts | `["destination", operation, normalizedEmail]` |
| Global email budget | `["mail-daily"]` |

The pinned Better Auth native key is `normalizedIP + "|" + normalizedEndpointPath`, constructed internally from the gateway-controlled header and base-path-normalized endpoint. Its entire string is one JSON array field under `native`, not an application namespace. Only the existing six approved operations reach it. Rate messages are bounded to 2048 UTF-8 bytes. Limits and windows are unchanged: native login 5/60 seconds; native reset/verification requests 3/900; reset/verify attempts 5/900; gateway IP login 5/60 and other operations 20/60; gateway global operation 60/60; destination login 10/900 and other email operations 3/900; all auth mail 20/86400. Native general fallback remains 60/60. Applicable layers must all allow the request.

### Normalization and persisted data

- Email is trimmed and lowercased before validation, lookup, library input and destination key construction. Standard email syntax and 254-character limits apply. Plus aliases and dots are preserved; no provider-specific mailbox folding is invented.
- Arbitrary `X-Forwarded-For` and caller-supplied internal IP headers are ignored. Only one validated address in Vercel's overwritten platform header is considered when the trusted runtime identifies itself as Vercel. Unknown/untrusted hosting uses the shared `127.0.0.1` bucket. Invalid values and address chains use that same conservative fallback.
- IPv4 is canonical dotted decimal; IPv4-mapped IPv6 becomes IPv4; other IPv6 is expanded lowercase hexadecimal and grouped to `/64`, matching Better Auth's default subnet rule. Equivalent spellings and rotating hosts in one `/64` do not get separate IP budgets. The native library validates/normalizes the internal header again.
- `private.auth_rate_limit` stores **only** the 64-character HMAC key, bounded count and start timestamp. It stores no raw IP, email, token, cookie or auth-subject string. HMACs are pseudonyms, not a claim of complete anonymization.
- New auth sessions explicitly omit IP and user-agent metadata via the session hook. The limiter still uses the trusted request IP in memory; rate limiting is not disabled. The required owner email remains plaintext in `auth_user` for login and email delivery. Synthetic fixtures use only `.invalid` mailboxes. Real email delivery would disclose the recipient to the separately approved mail provider; no real mail has been sent.

### Rotation and failures

**Cookie signing-secret rotation:** retain `AUTH_DERIVATION_SECRET`. Counter keys and workspace pseudonyms remain identical. Follow the operator revocation process, rotate `BETTER_AUTH_SECRET`, revoke database sessions and outstanding verification records as appropriate, and require owner reauthentication. Do not delete rate buckets or rotate both secrets reflexively. Tests prove that a new limiter/config with the unchanged derivation root still denies an exhausted bucket, and that environment signing-key rotation retains the independent root.

**Derivation-root or key-format rotation:** there is deliberately no online reset/key-ring fallback. It changes rate keys and workspace markers. Do not hot-swap it while requests are accepted. With separate owner authorization, coordinate the owner's volatile writing, stop **all auth/protected ingress and queued email work**, drain requests, and keep ingress closed for at least the longest window—**86400 seconds after the final request/mail attempt**, verified against database time and any latest bucket start/clock skew. Only after all old windows have expired may the operator replace the root/version, restart all instances consistently and reopen access. Old expired rows may then be pruned through operator maintenance. An emergency compromised-root rotation also keeps ingress denied until the drain completes. This avoids granting fresh quota within an active window. No rotation was executed here; the format changes are pre-production.

Derivation rotation changes workspace pseudonyms. The owner must explicitly preserve or discard volatile writing before maintenance. An overlooked mounted workspace remains locked and retained rather than being silently reassigned or discarded. Recovery of that memory under a changed identity marker is not automated. Changing limits/key namespaces also requires operator review of active windows; do not use configuration edits as a counter-reset mechanism.

Missing/invalid signing configuration prevents auth service initialization; missing/invalid derivation configuration prevents key construction before SQL. HTTP operations return sanitized unavailable responses, never an unkeyed hash, memory limiter, old-secret fallback or successful authentication. SQL failures deny the request. An unavailable public projection yields an unavailable DTO/503. Atomic PostgreSQL UPSERT semantics remain intact and concurrency tests still enforce the exact slot budget.

## 3. Production role requirements — checklist only

| Role | Required capability | Explicit exclusion |
| --- | --- | --- |
| Operator/migration | Direct verified-TLS connection; review/apply auth schema and role grants, provision the single approved user/credential/binding, revoke sessions and perform separately approved recovery | Never an app runtime credential; no public bootstrap/admin endpoint |
| Authentication runtime | Separate LOGIN principal inheriting only the reviewed `diary_auth_runtime` NOLOGIN group's grants; database CONNECT and schema USAGE; pooled verified TLS | No ownership/DDL, elevated flags/memberships, schema/database CREATE, owner-binding changes, user/account creation or unrelated data access |
| Future diary persistence | **Not created or granted anything in Phase 5** | No auth password/account/verification access, binding mutation or operator privileges. Exact entry-table permissions and concurrency policy require Phase 6 review; no speculative grants now |

Exact auth object grants, as implemented in migration 002:

| Object | Runtime grants |
| --- | --- |
| Database | CONNECT, through the separately reviewed LOGIN provisioning step; no CREATE; dedicated-database PUBLIC CONNECT/TEMP policy reviewed separately |
| `public`, `private` schemas | USAGE only |
| `public.auth_user` | SELECT; UPDATE only `emailVerified`, `updatedAt` |
| `public.auth_account` | SELECT; UPDATE only `password`, `updatedAt` |
| `public.auth_session` | SELECT, INSERT, UPDATE, DELETE |
| `public.auth_verification` | SELECT, INSERT, UPDATE, DELETE |
| `private.auth_rate_limit` | SELECT, INSERT, UPDATE, DELETE |
| `private.diary_owner` | SELECT only; no table **or column-level** mutation grants |

No sequence grant is required: identifiers are UUID/text, not generated serial sequences. No runtime object ownership, TRUNCATE, TRIGGER, user/account INSERT/DELETE, identity/email UPDATE, GRANT OPTION, migration or role management is needed. Review PUBLIC/inherited/default privileges, ownership, SECURITY DEFINER functions and SET ROLE reachability in the actual target. Do not assume a role name establishes least privilege.

`assertAuthRuntime` checks effective capabilities before login/session operations. It rejects elevated member roles (including NOINHERIT memberships), database/schema CREATE, owner mutation including column grants, user/account creation/deletion and unauthorized identity-column updates. Disposable PostgreSQL tests prove that the operator connection is refused and a column UPDATE grant on the owner binding is detected. The existing Neon provisioning role was previously observed to have create-database/create-role/BYPASSRLS/schema-CREATE capabilities; those trigger rejection. This review does not reconnect to or mutate production. `AUTH_DATABASE_URL` is mandatory and never falls back to `DATABASE_URL`.

The distinction between table and column permissions, and membership versus inherited privilege, follows the [PostgreSQL access privilege functions](https://www.postgresql.org/docs/14/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE). The negative grant tests exercise the actual local database rather than relying on role names.

Safe future production checklist — **do not execute without separate approval**:

1. Obtain explicit migration/provisioning authorization, actual owner email and independent mailbox/identity verification. Record the approved revision and operator securely.
2. Review a backup/restore plan, target database/branch privately, existing objects, shared-database implications and all auth SQL/grants. Rehearse reviewed migrations on an isolated branch/database first. Do not mutate unrelated application's PUBLIC permissions.
3. Use the direct operator connection to apply ordered reviewed migrations transactionally. Use no provisioning credentials in the web host. Confirm no diary tables are part of the change.
4. Create a separate runtime LOGIN with a random secret and membership only in the auth runtime group. Require `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, no privileged membership, no object ownership or CREATE/GRANT OPTION. Review effective table/column grants and PUBLIC/default privileges.
5. Grant CONNECT explicitly. Review dedicated-database PUBLIC CONNECT/TEMP, schema CREATE revocation and dangerous callable functions. Test the runtime guard positively and negatively before activation.
6. Set restricted pooled `AUTH_DATABASE_URL`; replace the old connectivity `DATABASE_URL` with an appropriate restricted principal too. Keep direct provisioning credentials off the application host. Set independent random signing and derivation secrets, exact trusted HTTPS origin and approved timezone through server secrets; do not write values into this repo or logs.
7. Only after separate owner provisioning approval, perform the single-owner parameterized transaction described in the runbook. Never overwrite an existing binding, temporarily enable signup or expose an HTTP bootstrap endpoint.
8. Independently approve a suitable verified free sender, activate no paid services, and privately test real verification/reset delivery, revocation and unchanged owner UUID. Confirm host-provided IP trust, HTTPS/cookies/no-store/CSRF, closed signup and non-owner rejection before separately approved frontend activation.

## 4. Complete Phase 5 diff audit

The audit includes tracked modifications and all new source, migrations, fixtures, screenshots and reports, not only `git diff`'s tracked-file output. The complete list is in `artifacts/phase-5/file-manifest.json`; nothing is staged. Approved PRD/plans, editor domain/workspace code, Phase 4 evidence and date utilities remain unchanged. The existing Phase 5 proposal is included unchanged.

| Review point | Outcome/evidence |
| --- | --- |
| Closed registration | Library disableSignUp, denied user-create hook, missing INSERT grants, six-operation HTTP allowlist; direct native signup denial test |
| Independent authorization | `/`, `/diary`, dated server page, session API, sign-out and health each call the authoritative owner boundary. Layout/proxy alone are insufficient. Recovery/verification use origin, owner-only destination or validated native token flows rather than requiring an existing session |
| Binding integrity | Singleton/FK/unique constraints, runtime SELECT only, effective privilege guard and negative mutation/column-grant tests |
| Secret/token handling | Server-only config/pool/derivation modules, minimal sanitized auth/session responses, no UUID in public DTO/HTML, fragment token links, HttpOnly cookies, secret scans, traces disabled |
| Cookies/CSRF | Explicit seven-day Secure-production/HttpOnly/Lax/host-only cookie; native origin/CSRF enabled plus gateway same-origin JSON checks; no bearer identity bypass |
| Recovery | Existing verified bound mailbox only; native expiring single-use reset transaction updates existing credential and revokes sessions; runtime cannot create users/accounts/bindings; concurrent token reuse test |
| Second identity/workspace | Non-owner login/session rejected. Synthetic operator-controlled distinct verified owner produces a different pseudonym and cannot unlock the original memory. Restoring the original binding permits same-owner reauthentication without losing text |
| Editor continuity | Same original textarea node/date/selection/scroll restored; memory retained on expiry/revocation; cached route data cannot unlock a locked workspace; logout warns/can cancel |
| Later-phase exclusion | No diary tables, diary storage adapter, save engine, IndexedDB/local/session storage, sync, rich text, new theme or Phase 6 implementation |

Session tokens are transported only in HttpOnly cookies. User-entered passwords and purpose-scoped emailed recovery tokens necessarily exist transiently in browser inputs/memory while being submitted; they are not embedded in public assets, HTML/RSC, logs or persistent browser storage. The review does not make an impossible claim that a password-entry browser never handles a password.

## 5. Visual evidence and verification

See [the actual screenshot gallery](./phase-5-visual-review.md). It includes desktop/390/320 login, desktop/mobile diary, all four desktop themes, password recovery, the locked reauthentication view and matching synthetic writing before/after reauthentication. No real identity, credential, token or diary text is pictured. UI/CSS/artwork are unchanged by this security review.

Fresh results: frozen install, token generation check, lint, strict TypeScript, **148/148 unit/component tests**, **13/13 PostgreSQL tests**, production build, **108/108 Playwright tests** and the 28-public-file client-output scan all passed. No tests were skipped. Embedded axe accessibility assertions passed for authentication/recovery, logout, calendar and all diary themes. Full metadata is in `artifacts/phase-5/verification.json`.

All six measured paper/editor geometries, rule spacings and overflow results match Phase 4. The three non-Sakura desktop header/paper crops match exactly. Sakura desktop/320/390 differ by only 13/31/36 illustration-edge pixels respectively, maximum 2/255 per channel, consistent with antialiasing variation. The necessary footer Sign out action is excluded from those crops. No visual regression or redesign was found. The matching synthetic writing before/after reauthentication was also visually inspected.

## 6. Remaining owner gates

Production remains intentionally unconfigured and fails closed. Owner email, explicit provisioning/migration authorization, restricted runtime role, independent secrets, trusted HTTPS hosting/IP policy, verified free sender eligibility and real delivery tests remain pending. Remote CI is pending the authorized commit/push at this pre-publication snapshot; no deployment is authorized.

The unused Phase 4 recovery contract still names a UUID owner key. Before any future browser recovery implementation, its public scoping contract must be reconciled with the new opaque browser identity so the internal UUID stays server-side. No recovery storage or speculative contract migration is implemented in this review.

Operational limits remain: volatile writing does not survive refresh/tab closure, derivation-root rotation requires a closed-ingress maintenance window, and real-host privileges/delivery have not been exercised. Separate owner authorization remains required for production provisioning, migrations, deployment and Phase 6.
