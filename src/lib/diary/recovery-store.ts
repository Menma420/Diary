import { recoveryRecordSchema, parseAcknowledgement, type RecoveryStorage, type RecoveryRecord, type RecoveryKey, type RecoveryResult, type MutationSnapshot, type Acknowledgement } from "./persistence-contracts";
export const RECOVERY_DATABASE = "dear-diary-recovery";
export const RECOVERY_VERSION = 1;
const keyOf = (key: RecoveryKey) => [key.workspaceId,key.date,key.writerId];
const canonical = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
const same = (a: unknown,b: unknown) => canonical(a) === canonical(b);
type Failure = Extract<RecoveryResult<never>,{ ok: false }>;
function reason(error: unknown): Failure {
  const name=error instanceof DOMException ? error.name : "";
  return { ok: false, reason: name === "QuotaExceededError" ? "quota" : name === "VersionError" || name === "DataError" ? "schema" : "transaction" };
}
// One queue covers all transactions, including cleanup. No deleteDatabase repair.
export class IndexedRecovery implements RecoveryStorage {
  private failures=new WeakMap<IDBTransaction,Failure>();
  private abort(tx: IDBTransaction, failure: Failure) { this.failures.set(tx,failure); tx.abort(); }
  private guarded(tx: IDBTransaction, callback: () => void) { return () => { try { callback(); } catch (error) { this.abort(tx,reason(error)); } }; }
  private queue: Promise<unknown> = Promise.resolve();
  private database: Promise<IDBDatabase> | undefined;
  constructor(private readonly factory: () => IDBFactory | undefined = () => globalThis.indexedDB) {}
  private open() {
    return this.database ??= new Promise<IDBDatabase>((resolve,reject) => {
      const factory=this.factory(); if (!factory) { reject(new Error("unavailable")); return; }
      const request=factory.open(RECOVERY_DATABASE,RECOVERY_VERSION); let blocked=false;
      request.onblocked=() => { blocked=true; reject(new Error("blocked")); };
      request.onerror=() => reject(request.error);
      request.onupgradeneeded=() => {
        const db=request.result;
        if (!db.objectStoreNames.contains("drafts")) {
          const store=db.createObjectStore("drafts",{ keyPath: ["key.workspaceId","key.date","key.writerId"] });
          store.createIndex("workspace","key.workspaceId",{ unique: false });
          db.createObjectStore("receipts");
        }
      };
      request.onsuccess=() => {
        const db=request.result;
        if (blocked) { db.close(); this.database=undefined; return; }
        if (!db.objectStoreNames.contains("drafts") || !db.objectStoreNames.contains("receipts")) { db.close(); reject(new DOMException("Invalid schema","VersionError")); return; }
        db.onversionchange=() => { db.close(); this.database=undefined; };
        resolve(db);
      };
    });
  }
  private run<T>(work: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<RecoveryResult<T>> {
    const operation=this.queue.then(async (): Promise<RecoveryResult<T>> => {
      try {
        const db=await this.open();
        return await new Promise<RecoveryResult<T>>((resolve) => {
          let value: T; let failed: Failure | null=null;
          const tx=db.transaction(["drafts","receipts"],"readwrite",{ durability: "strict" });
          tx.oncomplete=() => resolve(failed ?? { ok: true, value });
          tx.onabort=() => resolve(this.failures.get(tx) ?? failed ?? reason(tx.error));
          tx.onerror=() => { failed=reason(tx.error); };
          try { work(tx,(result) => { value=result; }); } catch (error) { failed=reason(error); tx.abort(); }
        });
      } catch (error) {
        // Keep failure visible but allow future attempts, without resetting data.
        if (!(error instanceof Error && error.message === "blocked")) this.database=undefined;
        return error instanceof Error && (error.message === "blocked" || error.message === "unavailable")
          ? { ok: false, reason: error.message } : reason(error);
      }
    });
    this.queue=operation.catch(() => {}); return operation;
  }
  readOwner(workspaceId: string): Promise<RecoveryResult<readonly RecoveryRecord[]>> {
    return this.run((tx,done) => {
      const request=tx.objectStore("drafts").index("workspace").getAll(workspaceId);
      request.onsuccess=this.guarded(tx,() => {
        const parsed=recoveryRecordSchema.array().safeParse(request.result);
        if (!parsed.success) { this.abort(tx,{ ok: false,reason: "schema" }); return; }
        done(parsed.data);
      });
    });
  }
  commit(input: RecoveryRecord, supersedes?: RecoveryRecord): Promise<RecoveryResult<void>> {
    const parsed=recoveryRecordSchema.safeParse(input);
    if (!parsed.success) return Promise.resolve({ ok: false, reason: "schema" });
    const record=parsed.data;
    return this.run((tx,done) => {
      const store=tx.objectStore("drafts"); const receipts=tx.objectStore("receipts");
      const previous=store.get(keyOf(record.key)); const receipt=receipts.get(keyOf(record.key));
      receipt.onsuccess=this.guarded(tx,() => {
        const old: RecoveryRecord | undefined=previous.result;
        const floor: { revision: number; baseVersion: number } | undefined=receipt.result;
        const replacing=Boolean(supersedes && old && same(supersedes,old) && same(supersedes.key,record.key) && record.revision>old.revision && record.pending===null);
        if ((supersedes && !replacing) || (old?.pending && !same(old.pending,record.pending) && !replacing) || (floor && (record.revision<=floor.revision || record.baseVersion<floor.baseVersion)) ||
          (old && (record.revision<old.revision || record.baseVersion<old.baseVersion ||
          (record.revision===old.revision && (record.content!==old.content || (old.pending && !same(old.pending,record.pending))))))) { this.abort(tx,{ ok: false,reason: "stale" }); return; }
        store.put(record); done(undefined);
      });
    });
  }
  acknowledge(key: RecoveryKey, mutation: MutationSnapshot, acknowledgement: Acknowledgement): Promise<RecoveryResult<void>> {
    try { parseAcknowledgement(mutation,acknowledgement); } catch { return Promise.resolve({ ok: false, reason: "schema" }); }
    return this.run((tx,done) => {
      const store=tx.objectStore("drafts"); const request=store.get(keyOf(key));
      request.onsuccess=this.guarded(tx,() => {
        const record: RecoveryRecord | undefined=request.result;
        if (!record || !same(record.pending,mutation) || record.revision<mutation.revision) { this.abort(tx,{ ok: false,reason: "stale" }); return; }
        tx.objectStore("receipts").put({ revision: mutation.revision, baseVersion: acknowledgement.version },keyOf(key));
        if (record.revision===mutation.revision && record.content===mutation.request.content) store.delete(keyOf(key));
        else store.put({ ...record, baseVersion: acknowledgement.version, pending: null });
        done(undefined);
      });
    });
  }
  discard(record: RecoveryRecord): Promise<RecoveryResult<void>> {
    return this.run((tx,done) => {
      const store=tx.objectStore("drafts"); const request=store.get(keyOf(record.key));
      request.onsuccess=this.guarded(tx,() => {
        if (!same(record,request.result)) { this.abort(tx,{ ok: false,reason: "stale" }); return; }
        store.delete(keyOf(record.key));
        tx.objectStore("receipts").put({ revision: record.revision, baseVersion: record.baseVersion },keyOf(record.key));
        done(undefined);
      });
    });
  }
}
