import { z } from "zod";
import { parseCalendarDate, type CalendarDate } from "@/lib/dates";

// Wire/storage boundaries only. No application adapter or save controller is active.
export const calendarDateSchema = z.string().refine((value) => parseCalendarDate(value) !== null, "Invalid calendar date")
  .transform((value) => parseCalendarDate(value)!);
export const entryContentSchema = z.string().refine((value) => !value.includes("\0"), "Unsupported null character")
  .refine((value) => new TextEncoder().encode(value).byteLength <= 256 * 1024, "Content exceeds 256 KiB");
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const revision = version;
export const entrySnapshotSchema = z.discriminatedUnion("exists", [
  z.strictObject({ exists: z.literal(false), date: calendarDateSchema, content: z.literal(""), version: z.literal(0) }).readonly(),
  z.strictObject({ exists: z.literal(true), date: calendarDateSchema, content: entryContentSchema,
    version: version.refine((value) => value > 0), updatedAt: z.iso.datetime(), lastMutationId: z.uuid() }).readonly(),
]);
export const entryWriteSchema = z.strictObject({ content: entryContentSchema, baseVersion: version, mutationId: z.uuid() }).readonly();
export const acknowledgementSchema = z.strictObject({ date: calendarDateSchema, version: version.refine((value) => value > 0),
  mutationId: z.uuid(), updatedAt: z.iso.datetime() }).readonly();
export type EntrySnapshot = z.infer<typeof entrySnapshotSchema>;
export type EntryWrite = z.infer<typeof entryWriteSchema>;
export type Acknowledgement = z.infer<typeof acknowledgementSchema>;
export function parseEntryForDate(date: CalendarDate, input: unknown): EntrySnapshot {
  const entry = entrySnapshotSchema.parse(input);
  if (entry.date !== date) throw new RangeError("Entry date does not match request");
  return entry;
}
export type PersistenceFailure = Readonly<{ code: "unavailable" | "unauthenticated" | "forbidden" | "invalid"; retryable: boolean }>;
export type EntryReadResult = { kind: "loaded"; entry: EntrySnapshot } | { kind: "failed"; error: PersistenceFailure };
export type EntryWriteResult = { kind: "acknowledged"; acknowledgement: Acknowledgement } |
  { kind: "conflict"; current: EntrySnapshot } | { kind: "failed"; error: PersistenceFailure };

// The adapter must be scoped to a verified owner by its caller. No client owner ID
// belongs in a request. Dates in responses must match the requested calendar date.
// Writes atomically compare baseVersion; exact mutation retries are idempotent.
export interface EntryPersistence {
  read(date: CalendarDate): Promise<EntryReadResult>;
  write(date: CalendarDate, request: EntryWrite): Promise<EntryWriteResult>;
}
export const mutationSnapshotSchema = z.strictObject({ date: calendarDateSchema, revision, request: entryWriteSchema }).readonly();
export type MutationSnapshot = z.infer<typeof mutationSnapshotSchema>;
export function parseAcknowledgement(mutation: MutationSnapshot, input: unknown): Acknowledgement {
  const acknowledgement = acknowledgementSchema.parse(input);
  if (acknowledgement.date !== mutation.date || acknowledgement.mutationId !== mutation.request.mutationId ||
    acknowledgement.version !== mutation.request.baseVersion + 1) throw new RangeError("Acknowledgement does not match mutation");
  return acknowledgement;
}

// Future server status, separate from editor dirty state and device durability.
// Saved requires an acknowledgement of the latest local revision, matching the
// exact date/mutation/version; acknowledging an older revision leaves it unsaved.
export type SaveState =
  | { status: "not-loaded" }
  | { status: "loading" }
  | { status: "unchanged"; entry: EntrySnapshot }
  | { status: "unsaved"; revision: number }
  | { status: "saving"; mutation: MutationSnapshot }
  | { status: "saved"; revision: number; acknowledgement: Acknowledgement }
  | { status: "save-failed"; mutation: MutationSnapshot; error: PersistenceFailure }
  | { status: "conflict"; mutation: MutationSnapshot; current: EntrySnapshot };

// v1.1 requires this shape for Phase 6. These are contracts, not durable storage.
export const recoveryKeySchema = z.strictObject({ ownerId: z.uuid(), date: calendarDateSchema, writerId: z.uuid() }).readonly();
export type RecoveryKey = z.infer<typeof recoveryKeySchema>;
export const recoveryRecordSchema = z.strictObject({ schemaVersion: z.literal(1), key: recoveryKeySchema,
  // Keep unsaveable drafts too. Server validation must not destroy local writing.
  content: z.string(), revision, baseVersion: version, updatedAt: z.iso.datetime(),
  pending: mutationSnapshotSchema.nullable(),
}).refine((record) => !record.pending || (record.pending.date === record.key.date &&
  record.pending.revision <= record.revision && record.pending.request.baseVersion === record.baseVersion &&
  (record.pending.revision !== record.revision || record.pending.request.content === record.content)), "Inconsistent pending snapshot").readonly();
export type RecoveryRecord = z.infer<typeof recoveryRecordSchema>;
export type RecoveryResult<T> = { ok: true; value: T } | { ok: false; reason: "unavailable" | "quota" | "blocked" | "schema" | "transaction" | "stale" };
export interface RecoveryStorage {
  // Enumerate all dates/writers for the verified owner, never choose by timestamp.
  readOwner(ownerId: string): Promise<RecoveryResult<readonly RecoveryRecord[]>>;
  // Serialize commits and acknowledgements. One transaction: reject stale
  // revisions/base versions and changed equal-revision content/pending metadata;
  // never resurrect an acknowledged mutation through an older queued commit.
  commit(record: RecoveryRecord): Promise<RecoveryResult<void>>;
  // One transaction: match pending ID/revision, update base, clear only that
  // mutation; remove only if latest revision equals the acknowledged revision.
  acknowledge(key: RecoveryKey, mutation: MutationSnapshot, acknowledgement: Acknowledgement): Promise<RecoveryResult<void>>;
}
