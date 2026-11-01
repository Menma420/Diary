# Dear Diary

Implementation of the approved Consolidated Implementation Baseline **v1.1**. Phases 1 and 2 are closed. [Phase 2 Foundation checks run 41231042181](https://github.com/Menma420/Diary/actions/runs/41231042181) succeeded for commit `260d1c1b0906ba93ac208dfce35bf9aae053654a`. The owner accepted Phase 3 on 1 November 2026 and authorized final verification, commit and push. Phase 4 requires separate explicit approval.

Next.js App Router, strict TypeScript, Zod, CSS Modules and semantic custom properties support a responsive diary preview at `/diary/DD/MM/YYYY`. Both `/` and `/diary` redirect to today's date using the configured timezone, initially Asia/Kolkata. The approved warm lined paper, compact controls, native textarea, four theme previews and four original temporary corner illustrations are retained. Supabase PostgreSQL/Auth remain the approved providers; their integration begins in Phases 5–6.

Previous/next move one Gregorian calendar day; Today is computed when clicked, including after sleep or midnight. A compact calendar supports month browsing, direct date entry, keyboard day/month/year navigation and a Today action. Dates are displayed, entered and routed as **DD/MM/YYYY**, as requested by the owner: for example, `/diary/01/11/2026`. Internal calendar values and semantic HTML dates retain ISO YYYY-MM-DD. Supported dates are 01/01/0001 through 31/12/9999. Invalid dates show a safe error instead of being silently normalized.

A lightweight date-keyed memory map in the persistent diary layout isolates drafts and remembers selection/scroll during client navigation and history traversal. Returning to a visited date restores that date's own text. Reloading or closing the tab clears all temporary drafts; refresh preserves the selected URL date only. The footer remains “Preview · not saved”. This is the expressly authorized Phase 3 memory model, without Phase 4 server/owner/revision/recovery contracts. Autosave and IndexedDB remain Phase 6. Appearance preview is volatile; persistent preferences and deterministic decoration selection remain Phases 7–8. No authentication, database/API integration, shuffle or uploads were added.

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
| `SUPABASE_URL` | Optional in Phase 1; required with all integration fields | Server |
| `SUPABASE_PUBLISHABLE_KEY` | Optional in Phase 1; required with all integration fields | Server |
| `OWNER_USER_ID` | Optional in Phase 1; provisioned UUID required with all integration fields | Server |

`src/lib/env.server.ts` imports `server-only`, reads the process environment, and validates before root rendering. Its integration accessor always requires all provider fields. Any partial integration configuration fails even in foundation mode. Error messages list field names without echoing values. No `NEXT_PUBLIC_*` configuration, administration key, login client, or provider request is present. Later phases must call the strict integration accessor before provider use; example values are not credentials.

`pnpm env:check --integrations` validates that future boundary without making a network request. With only the Phase 1 example it should fail and list missing fields. A missing required `APP_ORIGIN` fails both validation and rendering/build; the build is deliberately not made dependent on an unprovisioned Supabase account.

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

## Testing boundaries and phase control

See [recovery verification boundaries](tests/RECOVERY-BOUNDARIES.md) and its synthetic fixture seeds. These establish future coverage obligations; they do not implement or prove FR-19. Recovery schema/adapter contracts belong to Phase 4 and IndexedDB implementation to Phase 6. No mocked storage success is exposed as a server save.

The GitHub workflow executes locked install, environment/token checks, lint, type check, units, production build, sentinel scanning, and production browser tests as separate steps. Phase 2's remote run succeeded for the commit linked above. The existing pinned `@axe-core/playwright@4.14.0` now checks the diary and calendar across all four themes; browser projects cover desktop, 390 px and 320 px mobile Chromium. The owner authorized the Phase 3 commit and push. Its remote workflow result must be verified against the exact pushed SHA and reported in the final delivery; local verification alone does not establish remote CI success. No hosting is provisioned or deployed.

Keep the three approved Word documents in `documents/` unchanged. Later owner inputs remain the account/recovery contact before Phase 5, artwork rights before final visual asset acceptance, and hosting/region/backup objectives before Phase 10. None blocks foundation work.

Implementation setup follows the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Vitest](https://nextjs.org/docs/app/guides/testing/vitest), and [Playwright](https://nextjs.org/docs/app/guides/testing/playwright) guides. Exact installed versions and verification results are recorded in `docs/phase-1-report.md` and `docs/phase-2-report.md`.
