import type { CalendarDate } from "../dates";
import { editorContent, type ReadyEditor } from "./editor-model";
import { EditorWorkspace } from "./editor-workspace";
import { entryContentSchema, parseAcknowledgement, type Acknowledgement, type EntryPersistence, type EntrySnapshot, type RecoveryRecord, type RecoveryStorage } from "./persistence-contracts";
export type DiaryStatus = Readonly<{
  ready: boolean;
  phase: "loading" | "load-failed" | "unchanged" | "unsaved" | "saving" | "saved" | "save-failed" | "conflict";
  recovery: "checking" | "available" | "unavailable";
  durable: boolean;
  current?: EntrySnapshot;
  alternatives: readonly RecoveryRecord[];
}>;
type Track = {
  view: DiaryStatus; entry?: EntrySnapshot; record?: RecoveryRecord; sources: RecoveryRecord[]; retire: RecoveryRecord[];
  busy: boolean; resolving: boolean; composing: boolean; seenRevision: number; firstEdit: number | null; lastEdit: number | null; timer?: ReturnType<typeof setTimeout>; loaded: boolean;
};
const initial: DiaryStatus=Object.freeze({ ready: false, phase: "loading", recovery: "checking", durable: false, alternatives: [] });
const now=() => new Date().toISOString();
// All state is per mounted owner workspace; network/storage callbacks capture a date.
export class SaveController {
  private tracks=new Map<CalendarDate,Track>();
  private counter=0;
  getVersion=() => this.counter;
  private listeners=new Set<() => void>();
  private recoveryState: DiaryStatus["recovery"]="checking";
  private records: readonly RecoveryRecord[]=[];
  private startup: Promise<void> | undefined;
  private paused=false;
  private unobserve: (() => void) | undefined;
  private generation=0;
  constructor(readonly workspace: EditorWorkspace, private readonly workspaceId: string, private readonly writerId: string,
    private readonly entries: EntryPersistence, private readonly recovery: RecoveryStorage, private readonly lock: () => void = () => {}) {}
  subscribe=(listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot=(date: CalendarDate) => this.track(date).view;
  dates=() => [...this.tracks.keys()];
  private recoveryAvailability(available: boolean) {
    this.recoveryState=available ? "available" : "unavailable";
    for (const track of this.tracks.values()) if (track.view.recovery!==this.recoveryState) this.view(track,{ recovery: this.recoveryState });
  }
  private track(date: CalendarDate) {
    let track=this.tracks.get(date);
    if (!track) { track={ view: Object.freeze({ ...initial,recovery: this.recoveryState }), sources: [], retire: [], busy: false, resolving: false, composing: false, seenRevision: 0, firstEdit: null, lastEdit: null, loaded: false }; this.tracks.set(date,track); }
    return track;
  }
  private view(track: Track, changes: Partial<DiaryStatus>) { track.view=Object.freeze({ ...track.view,...changes }); this.counter++; for (const listener of this.listeners) listener(); }
  start() {
    this.unobserve ??= this.workspace.observe((state) => this.edit(state));
    return this.startup ??= this.recovery.readOwner(this.workspaceId).then(async result => {
      this.recoveryAvailability(result.ok);
      if (result.ok) this.records=result.value;
      for (const track of this.tracks.values()) this.view(track,{ recovery: result.ok ? "available" : "unavailable" });
      if (result.ok) await Promise.all([...new Set(result.value.map(record=>record.key.date))].map(date=>this.loadDate(date)));
    });
  }
  async open(date: CalendarDate) { this.track(date); await this.start(); await this.loadDate(date); }
  private loading=new Map<CalendarDate,Promise<void>>();
  private loadDate(date: CalendarDate): Promise<void> {
    const track=this.track(date);
    if (track.loaded) return Promise.resolve();
    const previous=this.loading.get(date); if (previous) return previous;
    const task=this.load(date,track).finally(()=>this.loading.delete(date)); this.loading.set(date,task); return task;
  }
  private async load(date: CalendarDate, track: Track) {
    const result=await this.entries.read(date);
    if (result.kind === "failed") {
      this.view(track,{ phase: "load-failed" }); this.authentication(result.error.code); return;
    }
    track.entry=result.entry;
    const recovered=this.records.filter(record=>record.key.date===date);
    track.sources=[...recovered];
    track.loaded=true;
    if (recovered.length>1) {
      this.workspace.hydrate(date,result.entry.exists ? { date,content: result.entry.content } : null);
    track.seenRevision=this.workspace.get(date).revision;
      this.view(track,{ phase: "conflict", current: result.entry, alternatives: recovered, ready: true, recovery: this.recoveryState }); return;
    }
    const source=recovered[0];
    if (source) {
      track.retire=[source];
      track.record={ ...source,key: { workspaceId: this.workspaceId,date,writerId: this.writerId } };
      this.workspace.hydrate(date,{ date,content: source.content },source.revision); track.seenRevision=this.workspace.get(date).revision;
      await this.store(track);
      if (source.pending) {
        await this.send(date,track);
        const fresh=await this.entries.read(date);
        if (fresh.kind === "failed") { track.loaded=false; this.view(track,{ phase: "load-failed" }); this.authentication(fresh.error.code); return; }
        if (!track.record) {
          track.entry=fresh.entry;
          this.workspace.hydrate(date,fresh.entry.exists ? { date,content: fresh.entry.content } : null); track.seenRevision=this.workspace.get(date).revision;
          this.view(track,{ phase: "unchanged" });
        } else if (track.record.baseVersion!==fresh.entry.version && !track.record.pending) this.conflict(track,fresh.entry);
        this.view(track,{ ready: true }); return;
      }
      if (source.baseVersion!==result.entry.version) { this.conflict(track,result.entry); this.view(track,{ ready: true }); return; }
      this.view(track,{ phase: "unsaved", ready: true }); this.schedule(date,track); return;
    }
    this.workspace.hydrate(date,result.entry.exists ? { date,content: result.entry.content } : null);
    track.seenRevision=this.workspace.get(date).revision;
    this.view(track,{ phase: "unchanged", ready: true, recovery: this.recoveryState });
  }
  private edit(state: ReadyEditor) {
    const track=this.track(state.date);
    track.composing=state.composition === "composing";
    if (!track.loaded || !track.entry || track.view.phase === "conflict") return;
    if (track.seenRevision === state.revision) {
      if (!track.composing && track.record && !track.busy) this.schedule(state.date,track); return;
    }
    track.seenRevision=state.revision;
    const record: RecoveryRecord={ schemaVersion: 1,key: { workspaceId: this.workspaceId,date: state.date,writerId: this.writerId },
      content: editorContent(state),revision: state.revision,baseVersion: track.record?.baseVersion ?? track.entry.version,
      pending: track.record?.pending ?? null,updatedAt: now() };
    track.record=record;
    track.firstEdit ??= performance.now();
    track.lastEdit=performance.now();
    this.view(track,{ phase: track.busy ? "saving" : "unsaved", durable: false });
    void this.store(track,record);
    this.schedule(state.date,track);
  }
  private async store(track: Track, record=track.record, supersedes?: RecoveryRecord) {
    if (!record) return true;
    const result=await this.recovery.commit(record,supersedes);
    this.recoveryAvailability(result.ok);
    // An older local completion must not certify a newer revision's durability.
    this.view(track,{ recovery: result.ok ? "available" : "unavailable",
      ...(track.record===record ? { durable: result.ok } : {}) });
    return result.ok;
  }
  private schedule(date: CalendarDate, track: Track) {
    clearTimeout(track.timer);
    if (this.paused || track.busy || track.composing || !track.record || track.view.phase === "conflict" || track.view.phase === "save-failed") return;
    const delay=Math.max(0,Math.min(track.lastEdit !== null ? 1000-(performance.now()-track.lastEdit) : 1000,track.firstEdit !== null ? 5000-(performance.now()-track.firstEdit) : 1000));
    track.timer=setTimeout(()=>{ void this.send(date,track); },delay);
  }
  private authentication(code: string) {
    if (code === "unauthenticated" || code === "forbidden") { this.setPaused(true); this.lock(); }
  }
  private isConflict(track: Track) { return track.view.phase === "conflict"; }
  private conflict(track: Track,current: EntrySnapshot) { this.view(track,{ phase: "conflict",current,alternatives: track.record ? [track.record,...track.sources.filter(source=>source.key.writerId!==this.writerId)] : track.sources }); }
  private async cleanupSources(track: Track) {
    // Only copies adopted by this workspace or explicitly discarded by the
    // owner's choice may retire. A writer discovered during a request is not one.
    const retiring=track.retire; track.retire=[];
    for (const source of retiring) {
      if (source.key.writerId!==this.writerId) {
        const result=await this.recovery.discard(source);
        if (!result.ok) { this.recoveryAvailability(false); continue; }
      }
      track.sources=track.sources.filter(candidate=>candidate!==source);
    }
  }
  private async send(date: CalendarDate, track: Track) {
    clearTimeout(track.timer);
    if (this.paused || track.busy || track.composing || !track.record || track.view.phase === "conflict") return;
    const retried=Boolean(track.record.pending);
    let mutation=track.record.pending;
    if (!mutation) {
      if (!entryContentSchema.safeParse(track.record.content).success) { this.view(track,{ phase: "save-failed" }); return; }
      mutation=Object.freeze({ date,revision: track.record.revision,request: Object.freeze({ content: track.record.content,baseVersion: track.record.baseVersion,mutationId: crypto.randomUUID() }) });
      track.record={ ...track.record,pending: mutation,updatedAt: now() };
      track.firstEdit=null; track.lastEdit=null;
    }
    track.busy=true; const generation=this.generation;
    this.view(track,{ phase: "saving" });
    // Exact identity and snapshot must enter IDB before dispatch whenever available.
    await this.store(track);
    if (this.paused || generation!==this.generation || this.isConflict(track)) { track.busy=false; if (!this.isConflict(track)) this.view(track,{ phase: "unsaved" }); this.schedule(date,track); return; }
    let result;
    try { result=await this.entries.write(date,mutation.request); }
    catch { result={ kind: "failed" as const,error: { code: "unavailable" as const,retryable: true } }; }
    if (result.kind === "acknowledged") {
      let acknowledgement: Acknowledgement;
      try { acknowledgement=parseAcknowledgement(mutation,result.acknowledgement); }
      catch { track.busy=false; this.view(track,{ phase: "save-failed" }); return; }
      if (retried) {
        // A historical receipt proves a commit, not that it is still the entry's
        // current version. Preserve local writing if another device advanced it.
        const fresh=await this.entries.read(date);
        if (fresh.kind === "failed") { track.busy=false; this.view(track,{ phase: "save-failed" }); this.authentication(fresh.error.code); return; }
        if (fresh.entry.version!==acknowledgement.version) { track.busy=false; this.conflict(track,fresh.entry); return; }
      }
      // Commit a newer edit before the cleanup CAS. Queued writes share one store queue.
      await this.store(track);
      const recovered=await this.recovery.acknowledge(track.record!.key,mutation,acknowledgement);
      this.recoveryAvailability(recovered.ok);
      const latest=track.record!;
      const complete=latest.revision===mutation.revision && latest.content===mutation.request.content;
      track.entry={ exists: true,date,content: mutation.request.content,version: acknowledgement.version,lastMutationId: acknowledgement.mutationId,updatedAt: acknowledgement.updatedAt };
      this.workspace.acknowledge(date,mutation.request.content);
      track.record=complete ? undefined : { ...latest,baseVersion: acknowledgement.version,pending: null,updatedAt: now() };
      if (complete) await this.cleanupSources(track);
      if (track.record) await this.store(track);
      track.firstEdit=track.record ? track.firstEdit ?? performance.now() : null;
      if (!track.record) track.lastEdit=null;
      if (!track.record) this.view(track,{ durable: false });
      if (track.sources.some(source=>!track.retire.includes(source))) {
        const fresh=await this.entries.read(date);
        this.conflict(track,fresh.kind === "loaded" ? fresh.entry : track.entry);
        if (fresh.kind === "failed") this.authentication(fresh.error.code);
      } else this.view(track,{ phase: track.record ? "unsaved" : "saved", durable: Boolean(track.record) && track.view.durable, recovery: recovered.ok ? track.view.recovery : "unavailable" });
    } else if (result.kind === "conflict") this.conflict(track,result.current);
    else { this.view(track,{ phase: "save-failed" }); this.authentication(result.error.code); }
    track.busy=false;
    if (track.view.phase === "unsaved") this.schedule(date,track);
  }
  async flushLocal() {
    const outcomes=await Promise.all([...this.tracks.values()].map(track=>this.store(track)));
    return outcomes.every(Boolean);
  }
  async flush() {
    await this.flushLocal();
    await Promise.all([...this.tracks].map(([date,track])=>this.send(date,track)));
    return [...this.tracks.values()].every(track=>!track.record && !track.busy && track.view.phase!=="conflict" && track.view.phase!=="load-failed");
  }
  retry(date: CalendarDate) {
    const track=this.track(date);
    if (!track.loaded) { void this.open(date); return; }
    if (track.view.phase !== "conflict") void this.send(date,track);
  }
  setPaused(paused: boolean) {
    this.paused=paused; this.generation++;
    for (const track of this.tracks.values()) clearTimeout(track.timer);
  }
  async resume() {
    this.setPaused(true);
    // Enumerate writers before allowing any queued mutation to resume.
    const local=await this.recovery.readOwner(this.workspaceId);
    if (!local.ok) {
      this.recoveryAvailability(false);
      for (const track of this.tracks.values()) this.view(track,{ recovery: "unavailable" });
    } else {
      this.records=local.value;
      for (const record of local.value) {
        const track=this.tracks.get(record.key.date);
        if (!track || !track.loaded) {
          this.track(record.key.date);
        } else if (record.key.writerId!==this.writerId || !track.record) {
          const previous=track.sources.find(source=>source.key.writerId===record.key.writerId);
          if (!previous || JSON.stringify(previous)!==JSON.stringify(record)) {
            track.sources=[...track.sources.filter(source=>source.key.writerId!==record.key.writerId),record];
            const fresh=await this.entries.read(record.key.date);
            if (fresh.kind === "loaded") this.conflict(track,fresh.entry);
          }
        }
      }
    }
    const resumable: [CalendarDate,Track][]=[];
    for (const [date,track] of this.tracks) {
      if (!track.loaded) await this.loadDate(date);
      const result=await this.entries.read(date);
      if (result.kind === "failed") {
        this.authentication(result.error.code);
        if (!track.record) track.loaded=false;
        this.view(track,{ phase: track.record ? "save-failed" : "load-failed" });
        if (result.error.code === "unauthenticated" || result.error.code === "forbidden") return;
        continue;
      }
      if (track.view.phase === "conflict") { this.conflict(track,result.entry); continue; }
      if (track.record && !track.record.pending && result.entry.version!==track.record.baseVersion) this.conflict(track,result.entry);
      else resumable.push([date,track]);
    }
    this.setPaused(false);
    for (const [date,track] of resumable) {
      if (track.record?.pending) await this.send(date,track);
      else if (track.record) this.schedule(date,track);
    }
  }
  async resolve(date: CalendarDate, choice: RecoveryRecord | "server") {
    const track=this.track(date); if (track.busy || track.resolving || this.paused || track.view.phase!=="conflict") return;
    track.resolving=true;
    try {
    const fresh=await this.entries.read(date);
    if (fresh.kind === "failed") { this.authentication(fresh.error.code); return; }
    if (this.paused) return;
    const previous=track.view.current;
    if (!previous || fresh.entry.version!==previous.version) { this.conflict(track,fresh.entry); return; }
    // A deliberate choice applies to all alternatives visible for this date.
    if (choice !== "server" && !track.view.alternatives.includes(choice)) return;
    if (track.record && !track.sources.some(source=>source.key.writerId===track.record!.key.writerId)) track.sources.push(track.record);
    const revision=Math.max(this.workspace.get(date).revision,...track.sources.map(source=>source.revision))+1;
    if (choice === "server") {
      for (const source of track.sources) {
        const discarded=await this.recovery.discard(source);
        if (!discarded.ok) { this.view(track,{ recovery: "unavailable" }); return; }
      }
      track.sources=[]; track.retire=[]; track.record=undefined; track.entry=fresh.entry;
      this.workspace.hydrate(date,fresh.entry.exists ? { date,content: fresh.entry.content } : null,revision); track.seenRevision=this.workspace.get(date).revision;
      this.view(track,{ phase: "unchanged", alternatives: [],current: undefined,durable: false });
    } else {
      const record: RecoveryRecord={ schemaVersion: 1,key: { workspaceId: this.workspaceId,date,writerId: this.writerId },content: choice.content,revision,baseVersion: fresh.entry.version,pending: null,updatedAt: now() };
      // Keep every original until the chosen text is durably captured and acknowledged.
      track.retire=[...track.sources];
      const supersedes=track.record ?? track.sources.find(source=>source.key.writerId===this.writerId);
      track.record=record; track.entry=fresh.entry;
      this.workspace.hydrate(date,{ date,content: choice.content },revision); track.seenRevision=revision;
      await this.store(track,record,supersedes);
      this.view(track,{ phase: "unsaved",alternatives: [],current: undefined });
      await this.send(date,track);
    }
    } finally { track.resolving=false; }
  }
  stop() { this.setPaused(true); this.unobserve?.(); this.unobserve=undefined; }
}
