# Phase 3 date navigation implementation handoff

Date: 01/11/2026, Asia/Kolkata. Baseline: Consolidated Implementation Baseline v1.1 and its Phase 3 plan, with the owner's explicit Phase 3 authorization and subsequent DD/MM/YYYY instruction for display, input and URLs. The requested URL format supersedes the earlier recommended ISO URL format. The owner accepted Phase 3 and authorized final verification, commit and push on 01/11/2026. Deployment and Phase 4 implementation remain unauthorized and unstarted.

This report reflects the final DD/MM/YYYY routing revision. The production build, all 77 unit/integration tests and all 54 browser tests passed again after that change. Navigation, redirects, calendar selection, history, draft isolation and screenshot capture now use the revised URLs. The approved visual interface remains unchanged.

Local review: [today's diary](http://127.0.0.1:3100/) or [01/11/2026](http://127.0.0.1:3100/diary/01/11/2026). Writing remains temporary and is cleared by reload or tab closure.

## Starting repository and preserved work

The workspace is `/home/menma/Downloads/Diary`, branch `main`. The initial working tree was clean. Both local HEAD and the live GitHub `main` ref were verified as `260d1c1b0906ba93ac208dfce35bf9aae053654a`, the approved Phase 2 commit. Existing diary components, tests, the approved screenshot, v1.1 baseline and phase plan were inspected first.

The three Word planning documents remain byte-for-byte unchanged. Phase 2 screenshot artifacts, illustration assets, palette tokens, typography, paper/border styles and environment/provider boundaries were preserved. No dependencies were added or upgraded.

## Implemented navigation and routes

| Route | Behavior |
| --- | --- |
| `/` | Request-time temporary redirect to today's canonical date |
| `/diary` | Same request-time redirect, using configured timezone |
| `/diary/DD/MM/YYYY` | Validated exact Gregorian date; URL is the selected-date source of truth; for example `/diary/01/11/2026` |
| Invalid date segment | HTTP 404 with a diary-styled invalid-date message, no editable blank page, no silent normalization |

Both redirects are dynamic rather than build-time snapshots. The configured timezone is read through the existing server-only environment boundary; only the timezone string is passed to the client. Asia/Kolkata remains the default. No authentication is implemented: these are development preview routes, ready to be protected in Phase 5.

Previous and next move exactly one calendar day, including month, year, leap-day and early-year transitions. Controls are disabled only at the supported boundaries, 01/01/0001 and 31/12/9999. Today recomputes the date when clicked, so waking a tab after midnight does not leave its action stale. Midnight does not automatically navigate away from an active writing page.

The route is implemented by `src/app/diary/[day]/[month]/[year]/page.tsx`. The date page awaits the App Router's params promise, then validates the separate day, month and year segments through `dateFromRoute`. Day and month require two digits and year requires four; valid-looking but impossible dates are rejected. The adjacent layout also validates before the page's loading boundary streams, ensuring malformed and impossible dates return a real HTTP 404. Paper-shaped loading and recoverable route-error states expose no editor while a route cannot be opened. No diary read or database absence is simulated in this phase.

Browser refresh retains the selected URL date. Client navigation, browser Back and Forward use the persistent diary layout and restore the relevant date's temporary content. Superseded route responses are handled by the App Router; a controlled delayed-response test verifies they cannot replace a newer route or its draft.

## Date representation and formatting

`src/lib/dates.ts` defines a validated `CalendarDate` type. Internal calendar values are strict YYYY-MM-DD strings with actual Gregorian validation, including century rules. URL segments are validated as DD/MM/YYYY and mapped to these internal values at the route boundary. Date construction, day/month movement, weekday calculation and formatting use calendar integers. No browser-local midnight, implicit date parsing, UTC conversion or 24-hour timestamp addition is used for calendar arithmetic. Years below 100 therefore retain their intended century.

Only Today accepts a current timestamp. It extracts Gregorian Latin-digit year/month/day parts through `Intl.DateTimeFormat` with an explicit timezone, then constructs a calendar date. Display, direct input and URLs use exactly DD/MM/YYYY regardless of browser locale. For example, `02/01/0099` maps to `/diary/02/01/0099`; the internal date is `0099-01-02`. Semantic `time` values remain ISO calendar strings as required by HTML.

| Representation | Example for 1 November 2026 |
| --- | --- |
| Display and calendar input | `01/11/2026` |
| Canonical URL | `/diary/01/11/2026` |
| Internal calendar value and draft-map key | `2026-11-01` |
| Semantic HTML `time` value | `2026-11-01` |

The URL formatter converts the validated internal value to day/month/year order. Parsing converts the three URL segments back to the same internal key. This keeps the requested public format consistent without changing date arithmetic or draft ownership.

## Calendar and keyboard behavior

One calendar icon was added to the existing compact header. The picker uses a native modal dialog styled with existing theme tokens. It includes previous/next month controls, a seven-column day grid, selected-date styling, a Today marker/action, a direct DD/MM/YYYY jump field, and Close/Escape. It accepts past and future dates across the supported range.

The phase plan suggested beginning with a native date input. The owner's later fixed DD/MM/YYYY instruction takes precedence: browser-native date controls can choose their own locale format. A standard text input with strict parsing and an accessible calendar grid keeps the requested format consistent without a date-picker dependency. The mobile text keyboard permits the required slash characters.

Arrow keys move days; Home/End move within the week; Page Up/Down move months; Shift with Page Up/Down moves years. Enter selects a focused date. One grid day participates in Tab navigation. The dialog contains Tab/Shift+Tab focus, marks the selected grid cell, announces the month, labels complete dates, and returns focus to the calendar control after selection or dismissal. Calendar selection does not unexpectedly activate the mobile writing keyboard. Selected-day focus has a contrasting inset outline.

All picker controls and day targets measure at least 44 × 44 px, including at 320 px. The modal stays within the viewport; short landscape/reflow heights allow scrolling within the dialog to reach its controls. The writing textarea continues to grow with the document and has no nested scrolling.

## Temporary draft isolation and editing continuity

`DiarySession` is mounted in the shared `/diary` layout. It owns a per-tab, date-keyed in-memory map. A record contains text, selection start/end/direction and document scroll position. A record is retained when its text is deliberately cleared. No record is evicted during navigation.

Edits synchronously update the record associated with the rendered date. Blur, selection changes and page cleanup capture that date's editing position. The new page receives only its own record, sizes the native textarea, and restores its selection/scroll. A previously untouched date starts empty. Revisiting a date restores its own draft even when the date page remounts. Delayed routes do not move or copy text between map keys.

Theme changes preserve the current textarea node, content, selection and focus. Theme preview state also remains in the shared layout during date navigation. Pointer navigation originating in writing restores writing focus on the committed target route; another deliberate focus choice cancels that intent. Clicking Today when already on that date preserves the existing selection and editing focus. Calendar selection returns to its control instead of forcing editor focus.

The status remains **Preview · not saved**. The accessible writing description states that drafts survive date navigation but are cleared by reloading or closing the tab. There are no localStorage, sessionStorage, IndexedDB, autosave, server write or database calls. A refresh preserves the date, **not the text**. Separate tabs have independent memory.

## Preparation for Phase 4 without implementing it

The persistent layout, canonical date type, date-keyed records, snapshot callbacks and guarded route-focus intent establish ownership boundaries for future editor work. Phase 4 can replace or extend the memory mechanism without deriving draft ownership from the currently visible page. Phase 6 can later integrate persistence through those boundaries.

This is not the full Phase 4 owner/date contract. It contains no authenticated owner identity, writer identity, revisions, server/base versions, mutation IDs, dirty/save state machine, recovery adapters, composition contract or persistence queue. Native undo behavior across different date pages or reloads is not promised. No server-read contract or conflict behavior is simulated.

## Verification and actual results

Runtime: Node 24.22.1 and pnpm 12.8.1, matching the pinned toolchain. All typed content and screenshots demonstrating drafts are synthetic. Following the owner's final approval, the complete verification suite was rerun before committing: locked install, environment and token checks, peer dependencies, lint, type checks, unit/integration tests, production build, client-output scan, browser tests and production screenshot capture. Actual results are recorded below.

| Check | Result |
| --- | --- |
| Locked dependency install | PASS, existing lockfile current; no version changes |
| Lint | PASS, zero warnings/errors |
| Type generation and strict TypeScript | PASS |
| Unit and integration suite | PASS, 5 files / **77 tests** |
| Token consistency | PASS |
| Integration environment validation | PASS using synthetic CI values; no credentials added |
| Peer dependency check | PASS |
| Production build | PASS; `/`, `/diary`, `/diary/[day]/[month]/[year]` dynamic, framework not-found static |
| Client-output sentinel scan | PASS, **27 assets/payloads**, no tested private values leaked |
| Full production browser suite | PASS, **54 tests** across desktop, 390 px mobile and 320 px mobile Chromium |
| Short-height calendar checks | PASS on all three browser projects; top/bottom control reachability and writing-preservation assertions are included in the **54-test** final browser suite |
| axe WCAG A/AA scans | PASS, zero violations in all four themes, both on the diary and open calendar, across three projects |
| Screenshot capture | PASS, five open/closed viewport cases, two isolated-draft images and the Phase 2 comparison; no browser errors or horizontal overflow |
| Final local HTTP checks | PASS, `/diary/01/11/2026` returns **200**; impossible `/diary/29/02/2026` returns **404** |
| Diff whitespace and planning-document preservation | PASS |

Date units cover strict strings, invalid Gregorian dates, leap-century rules, years below 100, day/month/year transitions, range limits, formatting, timezone differences and DST-region instants. Route integration tests verify index redirects and strict date-page behavior. Component integration tests deliberately remount date pages and repeatedly revisit distinct drafts, including empty text, Unicode, whitespace and backward selection.

Browser tests verify direct URLs, refresh, Back/Forward, root redirects, fresh Today after Kolkata midnight from a US browser timezone/locale, calendar month/year movement, numeric input validation, keyboard selection, focus containment, actual invalid-route HTTP 404s, date limits, rapid revisits and independent cleared text. Controlled request barriers verify obsolete responses and cancellation of delayed editor-focus restoration. Existing long-writing, line alignment, theme, focus, corner safety, touch size, reduced-motion and reflow checks remain covered.

The first browser pass exposed Tab focus escaping the calendar's page focus cycle. Explicit wrapping fixed it, and the complete suite passed afterward. Final HTTP inspection also exposed streamed success status on invalid-date UI; validation now runs above the loading boundary, and all invalid-route browser cases assert 404. These issues are resolved.

The reflow case is a half-size CSS viewport equivalent to 200% zoom, not a claim of manual browser-menu zoom. Automated accessibility and mobile emulation do not replace real-device or screen-reader review.

## Production screenshots and visual comparison

- [Desktop](../artifacts/phase-3/desktop.png) and [desktop calendar](../artifacts/phase-3/desktop-calendar.png)
- [390 px mobile](../artifacts/phase-3/mobile.png) and [mobile calendar](../artifacts/phase-3/mobile-calendar.png)
- [320 px mobile](../artifacts/phase-3/mobile-320.png) and [320 px calendar](../artifacts/phase-3/mobile-320-calendar.png)
- [Landscape](../artifacts/phase-3/landscape.png) and [landscape calendar](../artifacts/phase-3/landscape-calendar.png)
- [200% reflow equivalent](../artifacts/phase-3/zoom-200-reflow.png) and [reflow calendar](../artifacts/phase-3/zoom-200-reflow-calendar.png)
- [Date B draft](../artifacts/phase-3/draft-b.png) and [date A revisited](../artifacts/phase-3/draft-a-revisited.png)
- [Approved Phase 2 comparison](../artifacts/phase-3/phase-2-comparison.png) and [geometry/error measurements](../artifacts/phase-3/layout-metrics.json)

The final captures retain the exact approved desktop paper box (24, 80, 1005, 502 px) and editor box (52, 235, 949, 230 px), with 44 px rules. The 390 px and 320 px paper/editor geometry also matches approved Phase 2, with 34 px rules and eight-line minimums. Colors, border, illustrations, typography and footer are unchanged. Visible differences are the requested DD/MM/YYYY date, one compact calendar icon, live navigation behavior, and the picker when opened. Phase 2 artifacts were not overwritten.

Screenshots were regenerated using the final `/diary/DD/MM/YYYY` routes. Desktop and 390 px mobile images have identical SHA-256 hashes before and after the URL-only revision, confirming that the route change did not alter those rendered views.

## Files created and modified

Modified:

- `README.md` — current routing, draft limits, review evidence and capture commands.
- `playwright.config.ts` — adds the 390 px mobile project.
- `src/app/page.tsx` — dynamic Today redirect.
- `src/components/diary/DiaryHeader.tsx` — real day/Today controls and compact picker trigger.
- `src/components/diary/DiaryPreview.tsx` — URL-provided date, isolated memory and guarded focus.
- `src/components/diary/DiaryPaper.tsx` — per-date snapshot/restore callbacks and truthful draft description.
- `tests/unit/page.test.tsx` — remount isolation and editing continuity integration cases.
- `tests/e2e/visual-diary.spec.ts` — retains visual regressions while replacing fixture assumptions with real date behavior.

Created:

- `src/lib/dates.ts`
- `src/app/diary/layout.tsx`
- `src/app/diary/page.tsx`
- `src/app/diary/not-found.tsx`
- `src/app/diary/[day]/[month]/[year]/layout.tsx`
- `src/app/diary/[day]/[month]/[year]/page.tsx`
- `src/app/diary/[day]/[month]/[year]/loading.tsx`
- `src/app/diary/[day]/[month]/[year]/error.tsx`
- `src/app/diary/[day]/[month]/[year]/not-found.tsx`
- `src/components/diary/DiarySession.tsx`
- `src/components/diary/CalendarPicker.tsx`
- `src/components/diary/CalendarPicker.module.css`
- `src/components/diary/RouteNotice.tsx`
- `tests/unit/dates.test.ts`
- `tests/unit/routes.test.tsx`
- `tests/e2e/date-navigation.spec.ts`
- `scripts/capture-phase-3.mjs`
- `docs/phase-3-report.md`
- `artifacts/phase-3/` — the 13 PNGs and one JSON file linked above.

No files were deleted. Package manifest, lockfile, GitHub workflow, environment configuration, approved theme/paper CSS, SVG assets, Phase 2 evidence and Word documents were not changed.

## Remaining limits and approval gate

Temporary writing is confined to the current mounted tab session; reload, tab closure or navigation that reloads the document discards it. Memory grows with visited/written dates because silent draft eviction would violate the acceptance criterion. There is no durable or cross-device data protection yet. The truthful preview indicator remains visible.

Real iOS Safari/Android keyboard and screen-reader verification remain later device acceptance work. The calendar uses supported native dialog behavior plus explicit focus wrapping, but this phase's automated browser evidence is Chromium only. Existing temporary illustration rights/final-artwork decisions remain for the later artwork phase.

This report accompanies the approved Phase 3 commit. The exact commit SHA, GitHub Actions run link and actual conclusion are verified after pushing and reported in the final delivery. Local build/test success alone is not a remote CI result. No hosting or cloud resource was provisioned. Phase 4 requires the owner's separate explicit authorization.
