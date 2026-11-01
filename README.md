# Dear Diary

Implementation of the approved Consolidated Implementation Baseline **v1.1**. Phases 1–3 are closed. [Phase 3 Foundation checks run 41289750313](https://github.com/Menma420/Diary/actions/runs/41289750313) succeeded for commit `2210ef2b59bf4cd1299f370407176aa5d9e74ed6`. Phase 4 editor architecture and the separately authorized Neon PostgreSQL setup are implemented. The owner authorized a final scope/security audit, fresh verification, two commits where separable, push and exact-commit CI verification. The earlier reports preserve their pre-commit review status. No frontend deployment or authentication implementation is included.

Next.js App Router, strict TypeScript, Zod, CSS Modules and semantic custom properties support a responsive diary preview at `/diary/DD/MM/YYYY`. Both `/` and `/diary` redirect to today's date using the configured timezone, initially Asia/Kolkata. The approved warm lined paper, compact controls, native textarea, four theme previews and four original temporary corner illustrations are retained. The later owner request selects Neon for PostgreSQL instead of the originally planned Supabase database. Authentication remains unimplemented; this request enabled only PostgreSQL.

Previous/next move one Gregorian calendar day; Today is computed when clicked, including after sleep or midnight. A compact calendar supports month browsing, direct date entry, keyboard day/month/year navigation and a Today action. Dates are displayed, entered and routed as **DD/MM/YYYY**, as requested by the owner: for example, `/diary/01/11/2026`. Internal calendar values and semantic HTML dates retain ISO YYYY-MM-DD. Supported dates are 01/01/0001 through 31/12/9999. Invalid dates show a safe error instead of being silently normalized.

A date-keyed editor workspace in the persistent diary layout isolates drafts and remembers selection/scroll during client navigation and history traversal. Returning to a visited date restores that date's own text. Phase 4 separates immutable plain-text state and transitions from the controlled native textarea, with local revisions, dirty/pristine calculation, composition/read-only behavior and stale-session rejection. Reloading or closing the tab clears all temporary drafts; refresh preserves the selected URL date only. The footer remains “Preview · not saved”. Entry and recovery interfaces are contracts only; no diary persistence adapter is connected. Autosave and IndexedDB remain Phase 6. Appearance preview is volatile; persistent preferences and deterministic decoration selection remain Phases 7–8. No authentication, diary data API, shuffle or uploads were added. The separately requested Neon integration verifies PostgreSQL connectivity only.

## Local setup

Use Node **24.22.1** (`.nvmrc` / `.node-version`) and pnpm **12.8.1** (`packageManager`). If using nvm, install/select the project runtime before running pnpm:

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@12.8.1 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm env:check
pnpm dev
```

Open the Local URL printed by Next.js (normally `http://127.0.0.1:3000`). The supplied `.env.example` uses that origin; keep `APP_ORIGIN` aligned with the exact origin used in your browser before future same-origin/authentication work. Do not commit `.env.local`. No external fonts or artwork are fetched.

In the current Codex workspace, the available Node 24 binary is bundled rather than the default shell runtime. For this environment only:

```sh
export PATH=/home/menma/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
node --version
pnpm --version
```

This changes only the current shell. The repository has no machine-specific runtime dependency.

## Neon PostgreSQL setup

The workspace is linked through ignored `.neon` metadata to organization `org-blue-night-62231221`, project `spring-bar-19934102` (Diary), branch `production` (`br-holy-heart-b4yqhxus`). `neon.ts` declares the service policy. `neon deploy` applies it and pulls `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `NEON_BRANCH` into ignored `.env.local` (or `.env` when that file exists). Keep the other local origin/timezone settings. No credentials belong in source control or `NEXT_PUBLIC_*` variables.

Use the pinned Node 24 runtime for Neon setup as well as the app; the skills installer requires Node 22.20 or newer. The verified CLI is Neon 8.16.0. Once signed in:

```sh
neon init -y --org-id org-blue-night-62231221 --project-id spring-bar-19934102 --branch production --services postgres
neon config plan
neon deploy
npm run build
npm run start -- --port 3100
```

From another terminal run `npm run neon:check`. It calls the running Next.js `/api/health/postgres` route, which executes a real read-only `SELECT 1` through the server-only `pg` client. It also checks the diary page and verifies configured database credentials are absent from its HTML. `PREVIEW_URL` overrides the default `http://127.0.0.1:3100` for this check. Restart the server after refreshing environment values.

The app uses the pooled `DATABASE_URL`, strict TLS hostname/certificate verification, a bounded two-connection pool and 10-second connection/query timeouts. `@vercel/functions` manages pool suspension when running on Vercel; local Next.js uses the ordinary Node pool. The direct URL is reserved for future migrations. Builds make no database query, and CI does not require production credentials. The health route returns only connected/unavailable status, uses private/no-store responses, and returns HTTP 503 on failure without driver details.

This setup creates no diary schema or data writes. The editor remains in-memory with “Preview · not saved”. Authentication, database entry persistence, autosave and recovery remain separate implementation work. No auth, Data API, storage, functions or AI service was enabled. The reviewed deployment was a successful no-op because the selected branch already had PostgreSQL.

See [Neon setup verification](docs/neon-setup-report.md) for exact versions, commands, results and setup failures encountered. The original Word plans and Phase 4 work remain intact.

## Independent checks

```sh
pnpm tokens:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`typecheck` first generates Next route types so it works in a clean checkout. `test` runs Vitest and Testing Library once; `test:watch` is interactive. Playwright starts its own production server on port 3100, with desktop Chromium and 390 px and 320 px Chromium mobile viewports. Build first. CI installs the browser system dependencies too. These browser tests are not real-device or visual acceptance.

For a production smoke test, `pnpm start`. Development and production servers bind to loopback by default. Next builds do not replace the independent lint step.

## Environment boundary

| Name | Requirement | Visibility |
| --- | --- | --- |
| `APP_ORIGIN` | Required HTTP(S) origin, no credentials/path/query/fragment | Server |
| `DEFAULT_TIMEZONE` | Valid IANA zone; defaults to approved `Asia/Kolkata` if absent | Server |
| `DATABASE_URL` | Neon pooled connection URL, required by the PostgreSQL health route | Server only |
| `DATABASE_URL_UNPOOLED` | Pulled by Neon; reserved for future migrations, unused by the app | Server only |
| `NEON_BRANCH` | Pulled branch name; `production` in this workspace | Server only |
| `SUPABASE_URL` | Optional in Phase 1; required with all integration fields | Server |
| `SUPABASE_PUBLISHABLE_KEY` | Optional in Phase 1; required with all integration fields | Server |
| `OWNER_USER_ID` | Optional in Phase 1; provisioned UUID required with all integration fields | Server |

`src/lib/env.server.ts` imports `server-only`, reads the process environment, and validates before root rendering. Its legacy Supabase integration accessor requires all of that provider's fields. Any partial legacy integration configuration fails even in foundation mode. Error messages list field names without echoing values. No database credentials use `NEXT_PUBLIC_*`, and no administration key or login client is present. Neon validates the pooled URL separately through `@neon/env` and the server-only PostgreSQL module; its only current query is the explicit read-only health probe. Example values are not credentials.

`pnpm env:check --integrations` validates the legacy future Supabase/auth boundary without making a network request. It is not the Neon connectivity check; run `npm run neon:check` against the production server for that. With only the foundation example the legacy integration check should fail and list missing fields. A missing required `APP_ORIGIN` fails both validation and rendering/build. The build does not require an unprovisioned authentication account or make a database connection.

The client-output check is meaningful when building with the three synthetic sentinels below (CI does this). It scans public static assets and prerendered HTML/RSC; browser tests also inspect the rendered DOM:

```sh
SUPABASE_URL=https://phase1-private-config.example.invalid \
SUPABASE_PUBLISHABLE_KEY=phase1-browser-leak-sentinel \
OWNER_USER_ID=11111111-1111-4111-8111-111111111111 \
pnpm build
pnpm check:client
```

This proves the tested values did not leak in this build. Continue enforcing the server-only import boundary when real data flows are added.

## Design tokens

`src/themes/tokens.json` is the canonical validated palette source. Run `pnpm tokens:generate` after palette edits; `tokens:check` catches stale generated CSS. `src/themes/themes.ts` validates the records with Zod. CSS applies the palette through the root `data-theme` attribute; Sakura Pink is the initial theme. A compact native theme control previews all four palettes without persistence. Writing, selection and textarea identity survive these changes.

Each theme defines background, paper, paper border, ruled line, primary/muted text, two pastel accents, strong control accent, control foreground, focus ring, paper shadow and future decoration collection ID. Text on paper/frame and control labels are tested at 4.5:1; focus rings against both surfaces at 3:1. Pastel accents and paper rules are decorative, not readable control foregrounds.

`src/app/globals.css` defines the shared vocabulary: system rounded font stack, 16 px body, 18 px writing, 14 px caption, 28 px heading, 44 px desktop and 34 px mobile writing line height; spacing 4/8/12/16/24/32 px; paper/frame/control radii 10/28/8 px; 44 px touch target; 3 px focus outline/offset; 120 ms appearance duration and 0 ms with reduced motion. Values use relative units and remain subject to the approved Phase 2 screenshot comparison. Future textarea line height and rules must share `--writing-line-height`.

The original visual reference is available at `/home/menma/Pictures/Screenshots/Screenshot from 2026-10-31 19-32-50.png` and is embedded in the approved baseline. The implemented pink frame, warm solid-bordered paper, rules and corner tiles have been compared directly at the same 1053 × 662 size. The date is intentionally placed inside the paper per baseline v1.1. Original temporary SVG artwork is documented under `public/decorations/temporary/README.md` and identified in the footer; none was copied from the screenshot. The owner accepted the final Phase 2 visuals on 1 November 2026.

See [Phase 2 handoff](docs/phase-2-report.md), including approved desktop/mobile screenshots, measured layout geometry and accepted differences. Run the following historical capture script only against the approved Phase 2 revision; use the Phase 3 command below for this checkout. To regenerate historical evidence, serve that revision's production build, then run:

```sh
node scripts/capture-phase-2.mjs
```

`PREVIEW_URL` overrides the local URL; `REFERENCE_IMAGE` overrides the reference path for another machine. Screenshots and `layout-metrics.json` are generated in `artifacts/phase-2/`. The capture waits for hydration and image decoding. It also creates a side-by-side reference comparison; that comparison is QA evidence, not a product image. The 526 × 331 / DPR 2 capture is a 200% reflow equivalent, not a claim of a manual browser-zoom test.

Current routing, date ownership, tests, limits and file changes are documented in the [Phase 3 handoff](docs/phase-3-report.md). Regenerate current production evidence with `PREVIEW_URL=http://127.0.0.1:3100 node scripts/capture-phase-3.mjs` after building and starting the app on that port. This writes only to `artifacts/phase-3/`, keeping the approved Phase 2 evidence intact. Phase 3 has a closed/open-calendar capture at desktop, 390 px, 320 px, landscape and 200% reflow-equivalent widths, separate synthetic date-draft captures, and a direct Phase 2 comparison.

The [Phase 4 handoff](docs/phase-4-report.md) explains editor events, lifecycle, domain/persistence boundaries, future save semantics, verification and the complete file list. Current Phase 4 evidence is generated with `PREVIEW_URL=http://127.0.0.1:3100 node scripts/capture-phase-4.mjs`. It writes only to `artifacts/phase-4/`, captures all four themes, and checks that desktop/390/320 px Sakura screenshots exactly match approved Phase 3 PNGs. The approved earlier artifacts and Word plans are unchanged.

## Testing boundaries and phase control

See [recovery verification boundaries](tests/RECOVERY-BOUNDARIES.md) and its synthetic fixture seeds. These establish future coverage obligations; they do not implement or prove FR-19. Recovery schema/adapter contracts belong to Phase 4 and IndexedDB implementation to Phase 6. No mocked storage success is exposed as a server save.

The GitHub workflow executes locked install, environment/token checks, lint, type check, units, production build, sentinel scanning, and production browser tests as separate steps. It supplies only synthetic provider values, including Neon URLs/passwords, to verify that server configuration stays out of client output. The existing pinned `@axe-core/playwright@4.14.0` checks the diary and calendar across all four themes; browser projects cover desktop, 390 px and 320 px mobile Chromium. Local verification alone does not establish remote CI success; verify the actual workflow against the exact pushed SHA. Frontend hosting remains undeployed. See the [final scope and security audit](docs/phase-4-neon-final-audit.md) for this verification gate.

Keep the three approved Word documents in `documents/` unchanged. Later owner inputs remain the account/recovery contact before Phase 5, artwork rights before final visual asset acceptance, and hosting/region/backup objectives before Phase 10. None blocks foundation work.

Implementation setup follows the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Vitest](https://nextjs.org/docs/app/guides/testing/vitest), and [Playwright](https://nextjs.org/docs/app/guides/testing/playwright) guides. Exact installed versions and verification results are recorded in `docs/phase-1-report.md` and `docs/phase-2-report.md`.
