# Neon PostgreSQL setup and verification

Date: 01/11/2026. Workspace: `/home/menma/Downloads/Diary`. The owner explicitly requested Neon CLI installation, initialization against the supplied production branch, `neon deploy`, service wiring, a production build and live end-to-end verification. This request separately authorizes PostgreSQL setup after the local Phase 4 implementation; it does not implement diary saving or authentication.

## Result

The workspace is linked to organization `org-blue-night-62231221`, project `spring-bar-19934102` (Diary), branch `production` / `br-holy-heart-b4yqhxus`. Initialization succeeded using Node 24.22.1. `neon deploy` succeeded. The branch already matched the PostgreSQL-only policy, so applying it made no infrastructure changes. No new project or branch was created.

The app now has a server-only PostgreSQL connection using the pooled `DATABASE_URL` pulled by Neon. A running Next.js route executed a real read-only `SELECT 1` against that configured database and returned HTTP 200. The requested `npm run build` passed. The diary interface is preserved and still shows “Preview · not saved”; no diary tables, entry reads/writes, auth, autosave or recovery storage were added.

## Toolchain and connection choice

Neon CLI **8.16.0** is installed globally, including the installation selected by the user's terminal. App commands used the pinned Node **24.22.1** and pnpm **12.8.1**. The CLI installed its global agent plugin, skills and MCP configuration as part of `neon init`.

The installed Neon and Neon PostgreSQL skills and current official connection guidance were consulted. Standard `pg` is appropriate for this Node.js Next.js server and the planned Vercel Fluid runtime. The pool is attached to Vercel's lifecycle helper only when the platform sets `VERCEL`. No ORM, serverless HTTP driver, frontend SQL client or extra service was introduced.

Exactly pinned additions:

| Dependency | Version | Purpose |
| --- | --- | --- |
| `@neon/config` | 1.10.0 | Generated `neon.ts` policy |
| `@neon/env` | 1.6.8 | Read/validate injected PostgreSQL configuration |
| `pg` | 8.23.1 | Server-side TCP PostgreSQL driver |
| `@vercel/functions` | 3.10.5 | Connection-pool lifecycle support on Vercel |
| `@types/pg` | 8.23.1 | Development-only strict TypeScript definitions |

The existing package manager and direct dependency versions were retained. The lockfile contains the added packages and their dependency/optional-peer resolution; existing Next.js, React, TypeScript, Vitest and Playwright pins were not upgraded. No `package-lock.json` was created.

## Configuration and wiring

Ignored `.neon` stores local project/branch selection. Generated `neon.ts` records the PostgreSQL-only policy, with auth disabled and the CLI's default policy for future branches. No future branch was created. `.env.local` retains the existing origin/timezone and now includes the pulled `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `NEON_BRANCH`. Credentials are not included in this report, source, logs or browser responses. Local env permissions are 0600.

`postgres.server.ts` is protected with `server-only`. It reads only `DATABASE_URL` through `parseEnv`, lazily creates a two-connection `pg` pool, and performs no connection during build. The unpooled URL is reserved for later migration tooling. The client enforces certificate/hostname verification with `sslmode=verify-full`, enables channel binding, and bounds connection/query waits to ten seconds. Pool errors are not logged with raw connection details. The cache holds only a pool, never user identity or diary content.

`GET /api/health/postgres` is a dynamic Node.js route. It runs the constant, read-only query `SELECT 1::integer AS connected`, verifies the returned integer, and emits only connected/unavailable status. It exposes no SQL parameter, database name, username, endpoint, content or raw error. Failure returns HTTP 503. Responses use `Cache-Control: private, no-store` and noindex/nofollow.

`npm run neon:check` calls that route through the running HTTP server, then checks a real diary page and scans its rendered HTML for the configured URLs/passwords without printing them. The expanded `check:client` scan also checks public build assets against configured database credentials. Database access is not needed for ordinary preview rendering or CI builds.

## Commands and actual output

After user-completed browser login, `neon me` confirmed the DEFAULT OAuth session. These setup commands then ran:

```sh
neon init -y --org-id org-blue-night-62231221 --project-id spring-bar-19934102 --branch production --services postgres
neon config plan
neon deploy
```

Final deployment output:

```text
→ Applying to branch production (br-holy-heart-b4yqhxus)
No changes — branch production already matches the policy.

Utilized services: Postgres
Pulled 3 Neon variables into .env.local
  Postgres        DATABASE_URL, DATABASE_URL_UNPOOLED
  Branch          NEON_BRANCH
```

The exact requested `npm run build` ran under Node 24 with the real ignored local Neon environment:

```text
> dear-diary@0.1.0 build
> next build

▲ Next.js 16.4.3 (Turbopack)
- Environments: .env.local
✓ Compiled successfully in 3.2s
  Running TypeScript ...
  Finished TypeScript in 3.4s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/2) ...
✓ Generating static pages using 7 workers (2/2) in 370ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/health/postgres
├ ƒ /diary
└ ƒ /diary/[day]/[month]/[year]
```

The app was started with `npm run start -- --port 3100`:

```text
▲ Next.js 16.4.3
- Local:         http://127.0.0.1:3100
- Network:       http://127.0.0.1:3100
✓ Ready in 109ms
```

Actual `npm run neon:check` output from that running production app:

```text
GET /api/health/postgres: HTTP 200
{"status":"ok","services":{"postgres":"connected"}}
PASS: running Next.js route executed the read-only PostgreSQL SELECT 1 check.
PASS: diary HTTP 200; configured database credentials absent from rendered HTML.
```

This traversed HTTP → Next.js handler → real `pg` connection → the configured Neon database. It was not an MCP-side query or mocked success. It proves connectivity and the fixed read-only probe, not entry persistence, migrations, authentication or authorization.

## Other verification

| Check | Actual result |
| --- | --- |
| Lint | PASS, zero warnings/errors |
| Strict TypeScript / route generation | PASS |
| Unit/integration tests | PASS, **123 tests in 9 files**, including seven new PostgreSQL config/health-route cases |
| Existing production Playwright suite | PASS, **60 tests** on desktop, 320 px and 390 px Chromium |
| Accessibility | PASS within the browser suite: four themes and open/closed calendar, zero axe violations |
| Client output scan | PASS, **27 public assets/payloads**; configured PostgreSQL credentials absent |
| Peer dependencies | PASS, no issues |
| Whitespace | PASS, `git diff --check` |
| Existing local editor work | PASS, **21 files** compared byte-for-byte with the pre-Neon private backup; no differences |

The existing browser tests cover date routing, calendar navigation, history, isolated drafts, focus/selection/scroll, native paste/undo, all themes, mobile overflow, long writing and reflow. Existing CSS, artwork and approved Word plans were preserved. No remote CI run is claimed: nothing was committed or pushed.

## Files changed for Neon setup

Created:

- `neon.ts`
- `src/lib/postgres-config.ts`
- `src/lib/postgres.server.ts`
- `src/app/api/health/postgres/route.ts`
- `scripts/check-neon.mjs`
- `tests/unit/postgres.test.ts`
- `docs/neon-setup-report.md`

Modified:

- `package.json` and `pnpm-lock.yaml` — exact dependency pins and `neon:check` command.
- `.gitignore` — CLI-generated `.neon` exclusion.
- `.env.example` — documented variable names with synthetic examples only.
- `scripts/check-client-output.mjs` — include configured database credentials in the public-output scan.
- `README.md` — setup, runtime, provider override, configuration and verification instructions.

Ignored local files created/updated by the CLI: `.neon`, `.env.local`. The earlier Phase 4 files remain present and uncommitted; they are separate work, not additional Neon edits. No files were deleted.

## Failures encountered and resolution

1. The initial stored OAuth session failed with `invalid_grant`. The user's terminal was selecting an older Neon 5.0.0 installation, while the first upgrade had affected a different Node runtime. Both CLI installations were brought to 8.16.0, and the user successfully signed in through the browser. The DEFAULT session was verified before retrying.
2. The first authenticated initialization linked the project and pulled env, but its skills step failed because that command used Node 20.20.2. Re-running the exact initialization command with the pinned Node 24.22.1 runtime succeeded and preserved the existing generated config.

No unresolved deployment, build, connection or verification failure remains. pnpm reported the pre-existing ESLint deprecation notice; it did not fail checks. Real-device/mobile-keyboard and production Vercel deployment verification were not performed.

The app is available locally at `http://127.0.0.1:3100/`. No frontend hosting deployment was performed. Diary persistence, owner authentication, autosave and IndexedDB remain unimplemented; do not mistake PostgreSQL connectivity for a saved diary entry. The footer remains truthful.

References: [Neon connection selection](https://neon.com/docs/connect/choose-connection), [Neon Vercel guidance](https://neon.com/docs/guides/vercel-connection-methods), [node-postgres SSL](https://node-postgres.com/features/ssl), [node-postgres pool](https://node-postgres.com/apis/pool). Installed skills: `/home/menma/.agents/skills/neon/SKILL.md` and `/home/menma/.agents/skills/neon-postgres/SKILL.md`.
