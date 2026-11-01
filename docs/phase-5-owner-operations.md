# Phase 5 — Owner provisioning and recovery runbook

Status: procedure only. **No real owner has been provisioned. Production migrations, provisioning, email activation and deployment require separate explicit owner authorization.** Owner email is still pending. Never temporarily enable public signup.

## Preconditions and approval record

Record approval, environment, operator, time, reviewed Git revision, intended owner email and verified control of that mailbox in an access-controlled operational record. Do not put a real email, passwords, URLs containing credentials or tokens into this repository, terminal transcripts, issue trackers or screenshots. Identity verification must use a previously established independent channel; a request from a new email address alone is insufficient.

Back up the auth database using the operator's approved process. Review both SQL migrations, the exact Better Auth pin and the target database identity privately. Confirm that the target has no pre-existing incompatible `auth_*`, `private` or `diary_auth_runtime` objects. The reviewed migrations are one-time, ordered migrations; they intentionally do not silently overwrite existing objects. Track migration hashes and execution separately. They have been tested on disposable PostgreSQL, not applied to production.

## Database separation

Use an operator/migration connection to apply `migrations/auth/001_better_auth_1_7_15.sql`, then `002_owner_and_limits.sql`, in a reviewed transaction. Restrict the operator connection to trusted administration. Neither it nor the existing Neon provisioning connection belongs in `AUTH_DATABASE_URL`.

Create a separate runtime LOGIN principal with a cryptographically random password and only membership of the `diary_auth_runtime` NOLOGIN group. It must be `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, inherit the group's object permissions, and have only the required database CONNECT privilege. Review inherited memberships, database ownership, PUBLIC privileges and schema CREATE/TEMP privileges. Restrict CONNECT to the operator/runtime roles if this is a dedicated database. Do not revoke privileges from unrelated applications without reviewing the database's use.

The app reuses the existing bounded `pg` connection policy (two connections, verified certificate/hostname, channel binding, timeouts). `AUTH_DATABASE_URL` must use the restricted principal. Also replace the existing connectivity runtime `DATABASE_URL` with an appropriate restricted principal before production activation; reserve provisioning credentials for operator work. The runtime guard rejects elevated capability flags, schema CREATE, owner-binding mutation privileges and auth-user creation/deletion privileges. It must never be granted membership of an operator/owner role. Review effective permissions after provisioning; role flags alone do not establish least privilege.

The runtime can read users/accounts, update only `emailVerified`/`updatedAt` on users and password/updatedAt on accounts, manage sessions/verifications/rate limits, and read the binding. It cannot create users/accounts, change email/identity, delete users, write the owner binding, create schema objects or migrate. There are no diary tables.

## Separately approved first-owner provisioning

After approval and the actual owner email are supplied:

1. Independently verify the intended owner and mailbox. Establish recovery verification evidence through a separate trusted channel.
2. On a trusted operator machine, use the exact installed Better Auth `hashPassword` implementation to hash a strong, temporary random password. Read the password through a hidden prompt or secret manager; never place it in shell arguments, SQL literals/history, logs or this repo. Do not use a personal mailbox password.
3. Generate one stable internal owner UUID and one opaque Better Auth user ID **only at this authorized step**. In a single parameterized transaction, assert the singleton binding is empty, insert the user with `emailVerified = false`, insert the pre-provisioned `credential` account with that hash, then insert the singleton binding. Any failure rolls back all three. Review the generated schema for required fields. An existing binding means STOP; never replace it to make provisioning succeed.
4. Supply `AUTH_DATABASE_URL`, a cryptographically random `BETTER_AUTH_SECRET`, an independent `AUTH_DERIVATION_SECRET` encoding 32 random bytes as canonical base64url, the exact trusted HTTPS `APP_ORIGIN`, timezone and mail variables via server secrets. Leave legacy Supabase/`OWNER_USER_ID` variables unset; they do not authorize this application. Neither the internal owner UUID nor email is an application environment authorization switch.
5. With the owner's separate permission, configure a verified Brevo sender and API key on the free plan, confirm current limits and sender eligibility, and send one real verification email. No paid plan, sender-domain purchase or personal SMTP password is authorized by Phase 5.
6. The owner opens `/recover`, selects verification, follows the fragment link and explicitly verifies it. Verification alone does not create a session. Test real delivery privately, then have the owner sign in. Have the owner reset the temporary password through self-service recovery; this revokes all existing sessions. Confirm the internal owner UUID and binding did not change.
7. Verify signup denial, anonymous/non-owner rejection, cookie attributes, auth role permissions, seven-day expiry, session revocation and no-store behavior on the actual host before any frontend activation. Production hosting IP-header trust must be confirmed; only Vercel's overwritten platform header is currently recognized. Other hosts intentionally share a conservative rate bucket until a trusted adapter is reviewed.

No public bootstrap/admin endpoint or production provisioning command is included. The synthetic fixture runner refuses production connection reuse and is not a provisioning tool.

## Self-service password recovery

Only the bound, verified owner mailbox receives reset mail. Unknown/unverified accounts receive a generic acknowledgment without mail. Requests are durably limited per destination, IP/operation, globally per operation and globally to 20 emails/day. Tokens expire after 30 minutes, are stored using hashed verification identifiers, and are consumed once inside the library's password-reset transaction. Session revocation and password update occur in that transaction. Concurrent reuse must yield only one success. Fixed-origin URLs carry tokens in a fragment, not an HTTP query or redirect. The browser removes the fragment and submits it in a same-origin JSON POST. Do not log request bodies or enable HTTP/browser traces containing credentials.

Email verification uses the pinned library's signed 30-minute token. Replaying a completed verification is idempotent and never signs in, creates an account or rebinds ownership. It is distinct from single-use password-reset tokens. Revoke a compromised signing secret and rotate it through the operator process if verification/session signing material is exposed.

## Operator-assisted recovery

For mailbox loss or compromise, block further access operationally, preserve evidence and verify identity out of band against the previously recorded owner—not a new request's email or password. Record approval, reason, operator, timestamp, affected immutable owner UUID, session count revoked and a change reference. Never record token/password values or diary text.

Use the operator connection, never runtime privileges. In a reviewed transaction revoke all sessions for the bound auth user, delete outstanding verification/reset records for that identity, and replace its existing credential hash with a new temporary secret generated and handled as above. If the mailbox must change, separately approve and independently verify the new mailbox, update that same auth user's email, mark it unverified, and remove all outstanding verification records. Do not create a replacement user or change the singleton binding/internal UUID. Hash identifiers make targeted token removal nontrivial; with this one-owner service, deleting all outstanding auth verification records is the conservative option. Reject attempts to change the binding as a recovery shortcut.

Communicate the temporary credential only through the previously verified secure channel. Require new mailbox verification and password reset before reopening access. If signing material is compromised, rotate `BETTER_AUTH_SECRET`, invalidate old cookies and revoke database sessions; rotating only a password is insufficient. Audit results with value-free status records. Do not expose an administrative HTTP recovery API.

## Maintenance and failure behavior

Expired/revoked/unverified/mismatched sessions and database/mapping/limiter failures deny access. A previously mounted draft remains hidden, inert and read-only until the same owner reauthenticates. No durable draft recovery exists; refreshing/closing the tab loses writing. Recovery from a locked workspace opens a separate tab to preserve memory. Logout requires deliberate discard; failed logout retains writing and reports that revocation was not confirmed.

Use operator maintenance to prune old rate-limit rows and expired verification/session records, e.g. records outside their longest active window (rate rows older than two days). Review before executing; no Phase 5 cron/service was activated. Monitor aggregate, sanitized failure counts and free-mail quota without recording raw emails/IPs, cookies, tokens or diary content. Table rate keys are HMACs. See the final security review for exact HKDF/HMAC inputs, normalization, data retention and the mandatory closed-ingress window for derivation-root rotation. Signing-secret rotation keeps the derivation root unchanged to preserve rate limits and workspace identity. An outage or exhausted quota fails closed, rather than falling back to memory limits or logging recovery links.

## Official references

- [Better Auth options](https://better-auth.com/docs/reference/options), [sessions](https://better-auth.com/docs/concepts/session-management), [email/password recovery](https://better-auth.com/docs/authentication/email-password), [security](https://better-auth.com/docs/reference/security), [rate limiting](https://better-auth.com/docs/concepts/rate-limit), [PostgreSQL](https://better-auth.com/docs/adapters/postgresql).
- [Brevo free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan): free without a time limit, 300 emails/day, no unused-credit rollover. [Transactional API](https://developers.brevo.com/docs/send-a-transactional-email) supports password-reset delivery. [Pricing](https://www.brevo.com/pricing/) documents the free option. Eligibility, sender verification and continued free-plan terms must be reconfirmed before activation. No account/plan was activated or real delivery tested in Phase 5.
- [Vercel request-header trust](https://vercel.com/docs/headers/request-headers). Do not extend this trust to arbitrary `X-Forwarded-For` headers on another host.
