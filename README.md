# Dear Diary

Phase 1 foundation for the approved Consolidated Implementation Baseline **v1.1**. The owner explicitly authorized Phase 1 on 31 October 2026. Phase 2 requires separate approval.

Next.js App Router, strict TypeScript, Zod, CSS Modules and semantic custom properties are initialized. Supabase PostgreSQL/Auth remain the approved providers; their integration begins in Phases 5–6. There is no diary UI, date routing, editor, authentication, database, autosave, recovery implementation, theme selector, or decoration selection yet. The root page is an honest foundation placeholder.

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

`src/themes/tokens.json` is the canonical validated palette source. Run `pnpm tokens:generate` after palette edits; `tokens:check` catches stale generated CSS. `src/themes/themes.ts` validates the records with Zod. CSS applies the palette through the root `data-theme` attribute; Sakura Pink is the initial theme. No runtime switching or preference persistence is implemented.

Each theme defines background, paper, paper border, ruled line, primary/muted text, two pastel accents, strong control accent, control foreground, focus ring, paper shadow and future decoration collection ID. Text on paper/frame and control labels are tested at 4.5:1; focus rings against both surfaces at 3:1. Pastel accents and paper rules are decorative, not readable control foregrounds.

`src/app/globals.css` defines the shared vocabulary: system rounded font stack, 16 px body, 18 px writing, 14 px caption, 28 px heading, 44 px desktop and 34 px mobile writing line height; spacing 4/8/12/16/24/32 px; paper/frame/control radii 10/28/8 px; 44 px touch target; 3 px focus outline/offset; 120 ms appearance duration and 0 ms with reduced motion. Values use relative units and remain subject to the approved Phase 2 screenshot comparison. Future textarea line height and rules must share `--writing-line-height`.

The original visual reference is available at `/home/menma/Pictures/Screenshots/Screenshot from 2026-10-31 19-32-50.png` and is embedded in the approved baseline. Pink frame, warm solid-bordered paper, four corner tiles, and compact navigation govern Phase 2; final visual acceptance still requires direct comparison. Phase 1 does not claim that acceptance.

## Testing boundaries and phase control

See [recovery verification boundaries](tests/RECOVERY-BOUNDARIES.md) and its synthetic fixture seeds. These establish future coverage obligations; they do not implement or prove FR-19. Recovery schema/adapter contracts belong to Phase 4 and IndexedDB implementation to Phase 6. No mocked storage success is exposed as a server save.

The GitHub workflow executes locked install, environment/token checks, lint, type check, units, production build, sentinel scanning, and production browser tests as separate steps. It needs a GitHub remote and an actual workflow run to establish remote CI status. No hosting is provisioned or published by Phase 1.

Keep the three approved Word documents in `documents/` unchanged. Later owner inputs remain the account/recovery contact before Phase 5, artwork rights before final visual asset acceptance, and hosting/region/backup objectives before Phase 10. None blocks foundation work.

Implementation setup follows the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Vitest](https://nextjs.org/docs/app/guides/testing/vitest), and [Playwright](https://nextjs.org/docs/app/guides/testing/playwright) guides. Exact installed versions and actual verification results are recorded in `docs/phase-1-report.md` at handoff.
