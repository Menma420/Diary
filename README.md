# Dear Diary

Implementation of the approved Consolidated Implementation Baseline **v1.1**. Phase 1 is closed: [Foundation checks run 41220902880](https://github.com/Menma420/Diary/actions/runs/41220902880) succeeded for commit `e33ec55507b0812c0e9590d8c09445bcb0c62e6c`. The owner explicitly authorized Phase 2 on 31 October 2026 and approved the final visual implementation on 1 November 2026, including its writing-area and typography refinements. Phase 3 requires separate approval.

Next.js App Router, strict TypeScript, Zod, CSS Modules and semantic custom properties support a responsive visual diary preview at `/`. It contains warm lined paper, a paper date, compact controls, a native textarea, four theme previews and four original temporary corner illustrations. Supabase PostgreSQL/Auth remain the approved providers; their integration begins in Phases 5–6.

This phase uses three fixed date fixtures (30 October, 31 October and 1 November 2026). “Today” returns to the reference date, 31 October 2026. These controls change the displayed preview date, keep the same single writing surface, and do not navigate to date URLs. Text is volatile, survives appearance/fixture-label changes only within the mounted preview, and is lost on reload. The footer explicitly says “Preview · not saved”. Date routing/calendar behavior belongs to Phase 3; date-owned drafts and editor contracts to Phase 4; autosave and IndexedDB to Phase 6. Appearance preview does not save preferences or select decorations; those remain Phases 7–8. No authentication, database/API integration, shuffle, uploads or other product features were added.

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

`typecheck` first generates Next route types so it works in a clean checkout. `test` runs Vitest and Testing Library once; `test:watch` is interactive. Playwright starts its own production server on port 3100, with desktop Chromium and a 320 px Chromium mobile viewport. Build first. CI installs the browser system dependencies too. These browser tests are not real-device or visual acceptance.

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

See [Phase 2 handoff](docs/phase-2-report.md), including desktop/mobile screenshots, measured layout geometry and outstanding differences. To regenerate the evidence, serve the production build (`pnpm build`, then `pnpm start` in a retained terminal), then run:

```sh
node scripts/capture-phase-2.mjs
```

`PREVIEW_URL` overrides the local URL; `REFERENCE_IMAGE` overrides the reference path for another machine. Screenshots and `layout-metrics.json` are generated in `artifacts/phase-2/`. The capture waits for hydration and image decoding. It also creates a side-by-side reference comparison; that comparison is QA evidence, not a product image. The 526 × 331 / DPR 2 capture is a 200% reflow equivalent, not a claim of a manual browser-zoom test.

## Testing boundaries and phase control

See [recovery verification boundaries](tests/RECOVERY-BOUNDARIES.md) and its synthetic fixture seeds. These establish future coverage obligations; they do not implement or prove FR-19. Recovery schema/adapter contracts belong to Phase 4 and IndexedDB implementation to Phase 6. No mocked storage success is exposed as a server save.

The GitHub workflow executes locked install, environment/token checks, lint, type check, units, production build, sentinel scanning, and production browser tests as separate steps. The Phase 1 run succeeded for the commit linked above. Phase 2 adds axe accessibility checks using the pinned development dependency `@axe-core/playwright@4.14.0`; Playwright runs all four themes through WCAG A/AA scans on desktop and mobile Chromium. The owner authorized committing and pushing Phase 2 on 1 November 2026. Remote results must be checked against the pushed commit's exact SHA in [Foundation checks](https://github.com/Menma420/Diary/actions/workflows/ci.yml); a local pass or older run does not establish that result. No hosting is provisioned or deployed.

Keep the three approved Word documents in `documents/` unchanged. Later owner inputs remain the account/recovery contact before Phase 5, artwork rights before final visual asset acceptance, and hosting/region/backup objectives before Phase 10. None blocks foundation work.

Implementation setup follows the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Vitest](https://nextjs.org/docs/app/guides/testing/vitest), and [Playwright](https://nextjs.org/docs/app/guides/testing/playwright) guides. Exact installed versions and verification results are recorded in `docs/phase-1-report.md` and `docs/phase-2-report.md`.
