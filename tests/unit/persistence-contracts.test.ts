import { expect, it } from "vitest";
import { parseCalendarDate, type CalendarDate } from "@/lib/dates";
import { acknowledgementSchema, calendarDateSchema, entryContentSchema, entrySnapshotSchema, entryWriteSchema, mutationSnapshotSchema, parseAcknowledgement, parseEntryForDate, recoveryRecordSchema,
  type EntryPersistence, type EntryReadResult, type EntrySnapshot, type EntryWrite, type EntryWriteResult } from "@/lib/diary/persistence-contracts";

const a = parseCalendarDate("2026-10-31")!; const b = parseCalendarDate("2026-11-01")!;
const id = "11111111-1111-4111-8111-111111111111"; const nextId = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-11-01T00:00:00Z";
const missing = (date: CalendarDate) => entrySnapshotSchema.parse({ exists: false, date, content: "", version: 0 });
const request = (content: string, baseVersion = 0, mutationId = id) => entryWriteSchema.parse({ content, baseVersion, mutationId });

// Test double only: exercises the proposed adapter contract without network,
// timers, browser storage, authentication or any application integration.
class FakeEntries implements EntryPersistence {
  private readonly entries = new Map<CalendarDate, EntrySnapshot>();
  failReads = false;
  failWrites = false;
  async read(date: CalendarDate): Promise<EntryReadResult> {
    return this.failReads ? { kind: "failed", error: { code: "unavailable", retryable: true } }
      : { kind: "loaded", entry: this.entries.get(date) ?? missing(date) };
  }
  async write(date: CalendarDate, input: EntryWrite): Promise<EntryWriteResult> {
    const parsed = entryWriteSchema.safeParse(input);
    if (!parsed.success) return { kind: "failed", error: { code: "invalid", retryable: false } };
    if (this.failWrites) return { kind: "failed", error: { code: "unavailable", retryable: true } };
    const current = this.entries.get(date) ?? missing(date); const { content, baseVersion, mutationId } = parsed.data;
    if (current.exists && current.lastMutationId === mutationId) {
      if (current.content !== content || current.version !== baseVersion + 1) return { kind: "failed", error: { code: "invalid", retryable: false } };
      return { kind: "acknowledged", acknowledgement: acknowledgementSchema.parse({ date, version: current.version, mutationId, updatedAt }) };
    }
    if (current.version !== baseVersion) return { kind: "conflict", current };
    const version = current.version + 1;
    this.entries.set(date, entrySnapshotSchema.parse({ exists: true, date, content, version, lastMutationId: mutationId, updatedAt }));
    return { kind: "acknowledged", acknowledgement: acknowledgementSchema.parse({ date, version, mutationId, updatedAt }) };
  }
}
it("validates calendar identities without changing their date", () => {
  expect(calendarDateSchema.parse("0099-01-02")).toBe("0099-01-02");
  for (const invalid of ["01/11/2026", "2026-02-29", "2026-11-01T00:00:00Z"]) expect(calendarDateSchema.safeParse(invalid).success).toBe(false);
});
it("requires missing version zero and preserves existing empty entries with a positive version", () => {
  expect(missing(a).exists).toBe(false);
  expect(entrySnapshotSchema.parse({ exists: true, date: a, content: "", version: 1, updatedAt, lastMutationId: id }).exists).toBe(true);
  expect(entrySnapshotSchema.safeParse({ exists: false, date: a, content: "", version: 1 }).success).toBe(false);
  expect(entrySnapshotSchema.safeParse({ exists: true, date: a, content: "", version: 0, updatedAt, lastMutationId: id }).success).toBe(false);
});
it("rejects an otherwise valid read response for another date", () => {
  expect(parseEntryForDate(a, missing(a))).toEqual(missing(a));
  expect(() => parseEntryForDate(a, missing(b))).toThrow("Entry date does not match request");
});
it("acknowledgements must match the immutable mutation's date, ID and committed version", () => {
  const mutation = mutationSnapshotSchema.parse({ date: a, revision: 1, request: request("Snapshot", 4) });
  const acknowledgement = { date: a, version: 5, mutationId: id, updatedAt };
  expect(parseAcknowledgement(mutation, acknowledgement)).toEqual(acknowledgement);
  for (const changes of [{ date: b }, { version: 6 }, { mutationId: nextId }]) {
    expect(() => parseAcknowledgement(mutation, { ...acknowledgement, ...changes })).toThrow("Acknowledgement does not match mutation");
  }
});
it("validates exact plain text by UTF-8 size without trimming it", () => {
  expect(entryContentSchema.parse(" \n🌸\n ")).toBe(" \n🌸\n ");
  expect(entryContentSchema.safeParse("x".repeat(256 * 1024)).success).toBe(true);
  expect(entryContentSchema.safeParse("🌸".repeat(65537)).success).toBe(false);
  expect(entryContentSchema.safeParse("x\0y").success).toBe(false);
});
it("rejects unsafe revisions, bad mutation IDs and client-supplied ownership", () => {
  for (const changes of [{ baseVersion: -1 }, { baseVersion: 0.5 }, { baseVersion: Number.MAX_SAFE_INTEGER + 1 }, { mutationId: "bad" }, { ownerId: id }]) {
    expect(entryWriteSchema.safeParse({ ...request(""), ...changes }).success).toBe(false);
  }
  expect(Object.isFrozen(request("Exact snapshot"))).toBe(true);
});
it("fake adapter distinguishes missing, existing empty and read failure", async () => {
  const store = new FakeEntries(); expect(await store.read(a)).toEqual({ kind: "loaded", entry: missing(a) });
  await store.write(a, request("")); const empty = await store.read(a);
  expect(empty).toMatchObject({ kind: "loaded", entry: { exists: true, content: "", version: 1 } });
  store.failReads = true; expect(await store.read(a)).toEqual({ kind: "failed", error: { code: "unavailable", retryable: true } });
});
it("fake adapter keeps writes isolated by date and reports version conflicts without overwriting", async () => {
  const store = new FakeEntries(); await store.write(a, request("A")); await store.write(b, request("B"));
  expect(await store.write(a, request("Stale", 0, nextId))).toMatchObject({ kind: "conflict", current: { content: "A", date: a } });
  expect(await store.read(b)).toMatchObject({ kind: "loaded", entry: { content: "B", date: b } });
  await store.write(a, request("", 1, nextId)); expect(await store.read(a)).toMatchObject({ kind: "loaded", entry: { exists: true, content: "", version: 2 } });
});
it("fake adapter retries an identical mutation once and rejects changed reuse", async () => {
  const store = new FakeEntries(); const input = request("Immutable");
  const first = await store.write(a, input); expect(await store.write(a, input)).toEqual(first);
  expect(await store.write(a, request("Different"))).toMatchObject({ kind: "failed", error: { code: "invalid" } });
  expect(await store.write(a, request("Immutable", 10))).toMatchObject({ kind: "failed", error: { code: "invalid" } });
  expect(await store.read(a)).toMatchObject({ kind: "loaded", entry: { content: "Immutable", version: 1 } });
});
it("fake adapter exposes failed writes without changing the last acknowledged text", async () => {
  const store = new FakeEntries(); await store.write(a, request("First")); store.failWrites = true;
  expect(await store.write(a, request("Newer", 1, nextId))).toMatchObject({ kind: "failed" });
  expect(await store.read(a)).toMatchObject({ kind: "loaded", entry: { content: "First", version: 1 } });
});
const record = () => ({ schemaVersion: 1, key: { ownerId: id, date: a, writerId: nextId }, content: "Newer local draft", revision: 2, baseVersion: 0, updatedAt,
  pending: mutationSnapshotSchema.parse({ date: a, revision: 1, request: request("Earlier immutable snapshot") }) });
it("recovery records preserve a newer local draft and exact unresolved snapshot separately", () => {
  const parsed = recoveryRecordSchema.parse(record());
  expect(parsed.content).toBe("Newer local draft"); expect(parsed.pending?.request.content).toBe("Earlier immutable snapshot");
  expect(Object.isFrozen(parsed.pending?.request)).toBe(true);
  expect(recoveryRecordSchema.parse({ ...record(), content: "", pending: null }).content).toBe("");
});
it("recovery validation preserves drafts rejected by server content validation", () => {
  const content = `\0${"🌸".repeat(65537)}`;
  expect(entryContentSchema.safeParse(content).success).toBe(false);
  expect(recoveryRecordSchema.parse({ ...record(), content, pending: null }).content).toBe(content);
});
it("recovery record validation rejects cross-date, future-revision, mismatched-base and same-revision snapshot errors", () => {
  const original = record();
  for (const pending of [{ ...original.pending, date: b }, { ...original.pending, revision: 3 },
    { ...original.pending, request: request("Other", 1) }, { ...original.pending, revision: 2 }]) {
    expect(recoveryRecordSchema.safeParse({ ...original, pending }).success).toBe(false);
  }
  expect(recoveryRecordSchema.safeParse({ ...original, schemaVersion: 2 }).success).toBe(false);
  expect(recoveryRecordSchema.safeParse({ ...original, key: { ...original.key, ownerId: "preview-owner" } }).success).toBe(false);
});
