# Phase 4 editor architecture handoff

Date: 01/11/2026, Asia/Kolkata. Starting branch: `main`. Starting and still-current commit: `2210ef2b59bf4cd1299f370407176aa5d9e74ed6`. The working tree was clean before implementation. Phase 3 and its exact-commit successful CI run were the approved starting point. This phase is local implementation only: no commit, push, deployment or Phase 5 work is authorized or performed.

The result is a small editor domain model, date-keyed workspace/controller, React binding and controlled native textarea. The approved diary composition, CSS, themes, illustrations, date routes, navigation and truthful preview footer are preserved. No dependency was added or upgraded.

## Inspection and controlling requirements

Before changing files, the PRD attachment, all three approved Word plans, Phase 1–3 handoffs, recovery verification boundary, installed Next.js client/layout documentation, current editor components and tests were inspected. The implementation plan and concerns were reported before the first edit.

Phase 3 kept a mutable `MemoryDraft` map in the persistent `DiarySession`. `DiaryPreview` mutated its text/position directly, and `DiaryPaper` both rendered stationery and managed textarea input, height and restoration. Its existing persistent layout and guarded navigation/theme focus behavior were retained rather than replaced.

The planning files retain historical ISO URL examples and pre-development approval wording. Later owner instructions and approvals control: public dates and URLs remain DD/MM/YYYY. The Word plans and PRD were not modified. The v1.1 recovery record and transactional adapter requirements are represented as contracts only. Authentication, owner provisioning, adapter implementations and operational recovery remain later phases.

## Responsibilities and model

| Layer | Responsibility |
| --- | --- |
| Existing date page and `DiaryPreview` | Date context, diary composition, theme/navigation controls and guarded focus intent |
| Existing persistent `DiarySession` | Own one in-memory `EditorWorkspace` for the mounted tab/layout; retain appearance state separately |
| `editor-model.ts` | React-independent types, immutable states, explicit events, input invariants and dirty calculation |
| `editor-workspace.ts` | Independent date records, subscriptions and editing-session tokens; no storage or timers |
| `useDiaryEditor.ts` | Subscribe React to the selected date and capture valid native selection/scroll snapshots |
| `DiaryPaper` and `DiaryEditor` | Paper composition and native input respectively, using the existing stylesheet and hierarchy |
| `persistence-contracts.ts` | Validated future entry/mutation/recovery shapes and interfaces; no operational adapter |

`CalendarDate` remains the existing strict Gregorian calendar identity. There is no new date parser, browser-local midnight calculation, timezone conversion or URL format. A plain-text `EditorDocument` contains only `date` and `content`. A missing local document is `null`; a deliberately empty document is `{ date, content: "" }`. Neither is an assertion that a server read has occurred.

A ready editor contains its date, document, immutable baseline, local revision, selection, document `scrollY`, editable/read-only mode and idle/composing phase. The baseline supports local pristine/dirty calculation; it is not a server acknowledgement. Selection uses native textarea UTF-16 offsets and preserves forward/backward/none direction. Snapshots and their document/selection objects are frozen. Text is never trimmed, normalized or rendered as HTML.

Lifecycle is `not-loaded → ready → disposed`. Initialization validates the date/mode. A successful explicit `load` supplies either a document or known missing result. The preview workspace initializes a local blank state without contacting a server. A future failed read must leave the UI unavailable; it must never be converted to a successful missing result. Re-loading a ready editor is rejected so an old read cannot replace local writing. Disposal is terminal in the pure model and is deliberately unavailable as an ordinary workspace edit.

## Events and transitions

| Event | Effect and invariant |
| --- | --- |
| `load` | Allowed only before readiness; validates matching date, copies the document and places a new caret at its end |
| `input` | Records exact native text and selection; increases local revision only for a content change |
| `replace` | Explicitly replaces all content, creates a present document and moves the modeled caret to its end |
| `clear` | Creates/retains a present empty document; never deletes the date record |
| `position` | Captures valid selection and finite nonnegative document scroll; does not dirty text or advance revision |
| `mode` | Changes editability without changing content, baseline, selection or revision |
| `composition` | Tracks native intermediate text; programmatic clear/replace is rejected while composing |
| `dispose` | Terminal pure-model lifecycle event; ordinary navigation uses session disconnect instead |

Dirty state compares document presence and exact content with the initialization baseline. Typing then deleting on a previously untouched date leaves a present, dirty empty document. Reverting an existing document to its original content is pristine, while the monotonically increasing revision still distinguishes editing history. Pristine here means unchanged from the local baseline, never “saved to the server.”

Invalid transitions return typed failure reasons and retain the previous state. These include not-ready input, duplicate load, read-only edits, replacement during composition, invalid selection/scroll, disposed state and stale editing sessions. Error text does not include diary content.

Each mounted editor connects with an opaque session token bound to its date. A replacement connection invalidates its predecessor. Late input, blur or cleanup cannot modify a replacement session. Disconnect releases the binding and ends composition while retaining text, revision, selection and scroll. Date navigation never evicts a draft. The workspace itself is discarded when its provider/tab lifetime ends; this phase has no durable recovery.

## Native editing and presentation

The controlled textarea gets its value from the model through `useSyncExternalStore`. It synchronously records native changes without transforming text. The browser retains normal paste and undo/redo within a mounted date editor. Composition events record intermediate text without attempting a save. Date changes mount a date-specific editor; no shared undo stack across dates or reloads is promised.

Text sizing, width/viewport resizing and font readiness use the existing document-growth technique. There is no nested editor scrolling. Theme changes retain the textarea node and current focus/selection. Date activation restores its own position and keeps the existing newer-focus-choice guard. Calendar use retains its accessible focus behavior. Scroll listeners capture document movement, including browser history navigation.

Cleanup checks both the bound date and current DOM text before capturing position, preventing a reused node for another date from contaminating the outgoing record. It removes resize/scroll listeners and observers and guards late font-ready callbacks. Read-only mode uses the native `readOnly` attribute plus domain rejection of synthetic edits; selection and copying remain available. There is no new read-only toggle or other product control.

## Future persistence boundary

`EntryPersistence` has just `read(date)` and `write(date, request)`. It is an interface only. Its future adapter must be scoped to a verified owner; no client owner ID is accepted by the write schema. A test-only in-memory fake exercises these semantics without being connected to the application.

Reads distinguish `loaded` from `failed`. A loaded snapshot explicitly distinguishes missing (`exists: false`, empty content, version 0) from existing (`exists: true`, exact content including empty, positive version, timestamp and last mutation ID). `parseEntryForDate` rejects a valid-looking response belonging to another date. Failed reads cannot be passed off as a missing entry.

Writes contain only exact content, nonnegative base version and UUID mutation ID. Results distinguish acknowledgement, conflict with the current snapshot, and failure. A mutation snapshot binds the request to its date and local revision. Schemas reject unexpected ownership fields, invalid dates/IDs, unsafe numeric versions, null characters and content over 256 KiB of UTF-8. `parseAcknowledgement` checks the original date, mutation ID and expected committed version. This validates a result; it neither changes editor text nor marks a newer revision saved.

The future adapter must atomically compare versions, retain explicitly cleared entries, and permit exact mutation retries without a second version increment. Reusing a mutation with different content/base is invalid. Superseded unknown mutations conflict conservatively. No server repository, API handler, Supabase client, database table or migration was added.

The version 1 recovery schema contains verified owner/date/writer key, latest text and local revision, acknowledged base version, update timestamp, and optional exact unresolved mutation. Validation checks date/base/revision consistency and retains newer text separately from older pending snapshots. Local draft content may exceed server validation limits: an invalid or oversized draft must remain recoverable rather than being silently truncated or lost. Pending server mutations still satisfy the server content schema.

`RecoveryStorage` defines owner-scoped enumeration, monotonic transactional commit and conditional acknowledgement/cleanup. Acknowledgement must match the pending mutation, advance the base, clear only that mutation and delete a record only if its latest revision is acknowledged. An equal-revision commit must not replace different text or pending metadata; stale commits must never regress an acknowledged base or resurrect a resolved mutation. Timestamps never choose a winning draft. Failures include unavailable storage, quota, blocked upgrade, schema and transaction errors. There is no discard/reset operation. Real transactional ordering, conflict reconciliation, owner authorization and browser failure handling are Phase 6 implementation obligations, not proven by these type/schema tests.

## Save-state semantics

Save state is a future persistence contract, separate from editor state, composing state and local durability. No save controller, timer, debounce or network dispatch is active.

| Future state | Meaning |
| --- | --- |
| `not-loaded` | No authoritative entry result is available |
| `loading` | A read is pending; this does not authorize a blank editor |
| `unchanged` | An authoritative result is loaded without subsequent edits; missing does not create a row |
| `unsaved` | The current revision lacks a server acknowledgement |
| `saving` | A particular immutable mutation is unresolved; newer edits may exist |
| `saved` | A matching acknowledgement covers the latest local revision |
| `save-failed` | The mutation failed; preserve text and exact unresolved metadata |
| `conflict` | Server state differs; retain local and remote snapshots for a later deliberate decision |

An older acknowledgement may advance a future base version but must not mark newer text saved. A local transaction may eventually mean “Draft stored on this device”; it cannot mean server Saved. This phase uses neither state to imply durability: the visible status remains **Preview · not saved**. Reloading or closing the tab still loses all writing.

## Verification

Runtime: Node 24.22.1, pnpm 12.8.1. All test text is synthetic. No existing test was weakened, removed or modified.

| Check | Actual result |
| --- | --- |
| Lint | PASS, zero warnings/errors |
| Strict TypeScript and route generation | PASS |
| All unit/integration tests | PASS, **116 tests in 8 files**, including the existing 77 and 39 new cases |
| All production Playwright tests | PASS, **60 tests**, including the existing 54 and two new journeys across all three projects |
| Production build | PASS; existing dynamic `/`, `/diary`, `/diary/[day]/[month]/[year]` and static framework not-found route |
| Server configuration output scan | PASS, **27 assets/payloads**, three synthetic sentinels absent |
| Theme token consistency and peer dependencies | PASS; no version or palette changes |
| Integration environment validation | PASS with synthetic CI values; no provider credentials added |
| axe scans | PASS, **zero violations in 24 scans**: four themes × diary/open calendar × desktop/320/390 px Chromium |
| Editing and navigation | PASS: native typing/paste/undo/redo, whitespace/Unicode, date isolation/clearing, history, delayed responses, focus and backward selection |
| Long writing and responsive behavior | PASS: document growth, no nested textarea scrolling, no mobile horizontal overflow, 200% reflow equivalent and reduced motion |
| Per-date scroll restoration | PASS in unit integration and desktop/320/390 px production browser journeys |
| Production screenshots | PASS, six captures inspected; all three Sakura captures are byte-identical to the approved Phase 3 images |
| Whitespace, scope and planning-file preservation | PASS; existing CSS, artwork, date/navigation files, dependencies, workflow and approved Word files unchanged |

The new unit cases cover initialization, edits/replacements/clearing, empty versus missing, pristine/dirty, immutable snapshots, invalid transitions, read-only mode, composition, subscriptions, session replacement/detachment, cleanup and selection/scroll restoration. Contract cases cover response identity, version/mutation validation, fake adapter read/write failures, empty entries, isolation, conflicts, exact retries and recovery schema consistency. The fake is test evidence for the interface, not evidence of PostgreSQL or IndexedDB correctness.

The new browser journeys use actual Chromium clipboard paste and native undo/redo, then check all four themes without losing the node or backward selection. Long drafts are revisited through Back/Forward with their own text, caret direction and 600 px scroll position. All existing accessibility, date, timezone, calendar, delayed-navigation and visual checks ran unchanged.

## Screenshots and visual preservation

- [Desktop](../artifacts/phase-4/desktop.png)
- [390 px mobile](../artifacts/phase-4/mobile.png)
- [320 px mobile](../artifacts/phase-4/mobile-320.png)
- [Dreamy Sky](../artifacts/phase-4/dreamy-sky.png), [Lavender Dreams](../artifacts/phase-4/lavender-dreams.png), [Vintage Journal](../artifacts/phase-4/vintage-journal.png)
- [Measured geometry, hashes and browser errors](../artifacts/phase-4/layout-metrics.json)

The three Sakura views exactly match the corresponding approved Phase 3 PNG bytes. Desktop paper remains (24, 80, 1005, 502 px), editor (52, 235, 949, 230 px), rules 44 px. The 390 px and 320 px captures retain their existing geometry and 34 px rules. All six captures have no browser errors or horizontal overflow. Existing Phase 2/3 evidence was preserved.

Regenerate against a production preview with `PREVIEW_URL=http://127.0.0.1:3100 node scripts/capture-phase-4.mjs`. The script writes only to `artifacts/phase-4/` and fails if a Sakura screenshot differs from approved Phase 3 evidence.

## Files changed

Modified:

- `README.md` — current local phase, architecture and verification pointers.
- `src/components/diary/DiarySession.tsx` — retain the controller workspace in the existing layout provider.
- `src/components/diary/DiaryPreview.tsx` — bind a date to editor state while retaining composition/focus/navigation.
- `src/components/diary/DiaryPaper.tsx` — delegate input to the editor; keep paper markup and styling.

Created:

- `src/lib/diary/editor-model.ts`
- `src/lib/diary/editor-workspace.ts`
- `src/lib/diary/persistence-contracts.ts`
- `src/components/diary/useDiaryEditor.ts`
- `src/components/diary/DiaryEditor.tsx`
- `tests/unit/editor.test.ts`
- `tests/unit/editor-component.test.tsx`
- `tests/unit/persistence-contracts.test.ts`
- `tests/e2e/editor.spec.ts`
- `scripts/capture-phase-4.mjs`
- `docs/phase-4-report.md`
- `artifacts/phase-4/desktop.png`
- `artifacts/phase-4/mobile.png`
- `artifacts/phase-4/mobile-320.png`
- `artifacts/phase-4/dreamy-sky.png`
- `artifacts/phase-4/lavender-dreams.png`
- `artifacts/phase-4/vintage-journal.png`
- `artifacts/phase-4/layout-metrics.json`

Deleted: none. Dependencies, environment configuration and CI workflow: unchanged.

## Limits and review gate

Writing remains volatile and unprotected by authentication. Workspace lifetime is the mounted tab/layout, and memory grows with visited/edited dates because ordinary navigation never evicts writing. No real owner identity is fabricated. Phase 5 must establish a verified identity boundary before an owner-scoped persistent adapter is connected. This preview must not be presented as durable private diary storage.

Save-state types and recovery contracts do not implement autosave, IndexedDB, offline support, synchronization or conflict-resolution UI. No new indicators or product features were added. These contracts require real server/browser integration and race tests in Phase 6.

Composition was tested through DOM composition events; a real OS IME/mobile keyboard was not exercised. Browser coverage is Chromium emulation, not real iOS Safari/Android or screen-reader acceptance. Native undo across dates/remounts/reload is intentionally not promised. Font rendering on other platforms may differ from these captures, as before.

The local production build and checks passed. There is no Phase 4 remote CI run because this work is intentionally uncommitted and unpushed. The last approved remote result remains Phase 3 [Foundation checks #41289750313](https://github.com/Menma420/Diary/actions/runs/41289750313). No deployment or later-phase functionality was implemented. Stop for the owner's Phase 4 review and explicit authorization before any commit/push or Phase 5.
