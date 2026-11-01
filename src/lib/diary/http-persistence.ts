import { formatDate, type CalendarDate } from "../dates";
import { parseAcknowledgement, parseEntryForDate, type EntryPersistence, type EntryWrite, type PersistenceFailure } from "./persistence-contracts";
const error = (status: number): PersistenceFailure => ({ code: status === 401 ? "unauthenticated" : status === 403 ? "forbidden" : status === 400 || status === 413 ? "invalid" : "unavailable", retryable: status >= 500 || status === 429 });
export class HttpEntries implements EntryPersistence {
  async read(date: CalendarDate) {
    try {
      const response = await fetch(`/api/entries/${formatDate(date)}`,{ cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) return { kind: "failed" as const, error: error(response.status) };
      const body: unknown=await response.json();
      if (!body || typeof body !== "object" || !("entry" in body)) throw new Error("Invalid response");
      return { kind: "loaded" as const, entry: parseEntryForDate(date,body.entry) };
    } catch { return { kind: "failed" as const, error: error(503) }; }
  }
  async write(date: CalendarDate, request: EntryWrite) {
    try {
      const response=await fetch(`/api/entries/${formatDate(date)}`,{ method: "PUT", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(15000) });
      if (!response.ok && response.status !== 409) return { kind: "failed" as const, error: error(response.status) };
      const body: unknown=await response.json();
      if (!body || typeof body !== "object") throw new Error("Invalid response");
      if (response.status === 409 && "current" in body) return { kind: "conflict" as const, current: parseEntryForDate(date,body.current) };
      if (response.ok && "acknowledgement" in body) return { kind: "acknowledged" as const, acknowledgement: parseAcknowledgement({ date, revision: 0, request },body.acknowledgement) };
      throw new Error("Invalid response");
    } catch { return { kind: "failed" as const, error: error(503) }; }
  }
}
