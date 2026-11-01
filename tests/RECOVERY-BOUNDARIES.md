# Required recovery verification boundary

FR-19 is mandatory. Phase 1 supplies synthetic scenario seeds and the test runners only. These seeds are **not a production recovery schema** and are not proof of recovery behavior. Phase 4 defines versioned draft/mutation/adapter contracts. Phase 6 implements IndexedDB, transactional server writes, reconciliation, and executable recovery assertions together. Do not add a fake save, localStorage substitute, or premature database reset.

| Boundary | Required Phase 6 assertion |
| --- | --- |
| Committed local transaction + reload | Recover all owner/date/writer records, including empty content; read fresh server state first. |
| Unchanged server version | Resume against the same base; assert final server text/version and exact local record cleanup. |
| Advanced server version | Preserve both versions; require deliberate resolution; no automatic overwrite. |
| Older acknowledgement + newer typing | Retain newer revision and unresolved metadata; no false Saved. |
| Unknown commit | Retry the exact immutable mutation ID/content/base; no duplicate version increment; superseded unknown outcomes conflict conservatively. |
| Multiple tabs/dates/identities | Isolate by verified owner/date/writer; timestamps never choose a winner. |
| Quota/transaction/schema/blocked upgrade failure | Preserve memory; visibly report recovery unavailable; no destructive reset. |
| Expiry/logout | Pause writes until same-owner authentication; preserve unresolved writing across failed flushes. |
| Editor lifecycle | Same textarea node, selection/direction, focus and scroll through autosave, theme changes and guarded navigation. |

Use `fixtures/recovery-scenarios.json` as synthetic seeds, not as a substitute for real PostgreSQL and browser IndexedDB. Add controlled request barriers and fake debounce timers. Each recovery test must inspect final server content/version **and** the exact retained/removed local record. Device-only persistence may say “Draft stored on this device”; only a current server acknowledgement may say “Saved”.

No recovery tests run in Phase 1. Browser coverage here verifies only the foundation and token delivery. Mobile keyboard behavior, recovery failures, and visual fidelity remain later acceptance gates.

## Phase 6 executable evidence

The Phase 6 implementation now supplies `tests/unit/autosave.test.ts`, `tests/diary/database.test.mjs`, `tests/e2e/persistence.spec.ts` and `tests/e2e/recovery-store.spec.ts`. These exercise fake-timer/barrier races, actual controlled PostgreSQL functions, actual IndexedDB transactions and production-browser journeys. The early JSON seeds remain illustrative scenario inputs, not owner keys or a storage schema. Browser recovery uses the authenticated opaque workspace namespace rather than exposing the internal owner UUID. See `docs/phase-6-report.md` and `docs/phase-6-persistence-and-recovery.md` for final results, schema, limitations and rollout boundaries.
