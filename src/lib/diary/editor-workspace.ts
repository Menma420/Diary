import type { CalendarDate } from "@/lib/dates";
import { initializeEditor, transitionEditor, type EditorDocument, type EditorEvent, type ReadyEditor, type TransitionResult } from "./editor-model";

export type EditingSession = Readonly<{ date: CalendarDate; token: symbol }>;

// One mounted editor workspace. No identity, timers, storage or I/O.
export class EditorWorkspace {
  private readonly observers = new Set<(state: ReadyEditor) => void>();
  observe(listener: (state: ReadyEditor) => void) { this.observers.add(listener); return () => { this.observers.delete(listener); }; }
  acknowledge(date: CalendarDate, content: string) {
    const state=this.get(date);
    this.documents.set(date,Object.freeze({ ...state,baseline: Object.freeze({ date,content }) }));
    for (const listener of this.listeners.get(date) ?? []) listener();
  }
  hydrate(date: CalendarDate, document: EditorDocument | null, revision = 0) {
    const loaded = transitionEditor(initializeEditor(date), { type: "load", document });
    if (!loaded.ok || loaded.state.lifecycle !== "ready") throw new Error("Invalid document");
    const previous = this.documents.get(date);
    const length=document?.content.length ?? 0;
    const selection=previous ? Object.freeze({ ...previous.selection,start: Math.min(previous.selection.start,length),end: Math.min(previous.selection.end,length) }) : loaded.state.selection;
    this.documents.set(date, Object.freeze({ ...loaded.state, revision: Math.max(previous?.revision ?? 0,revision), selection, scrollY: previous?.scrollY ?? 0 }));
    for (const listener of this.listeners.get(date) ?? []) listener();
  }
  private readonly documents = new Map<CalendarDate, ReadyEditor>();
  private readonly sessions = new Map<CalendarDate, symbol>();
  private readonly listeners = new Map<CalendarDate, Set<() => void>>();

  load(date: CalendarDate, document: EditorDocument | null): TransitionResult {
    if (this.documents.has(date)) return { ok: false, reason: "already-loaded" };
    const result = transitionEditor(initializeEditor(date), { type: "load", document });
    if (result.ok && result.state.lifecycle === "ready") {
      this.documents.set(date, result.state);
      for (const listener of this.listeners.get(date) ?? []) listener();
    }
    return result;
  }
  get(date: CalendarDate): ReadyEditor {
    const existing = this.documents.get(date);
    if (existing) return existing;
    const result = this.load(date, null);
    if (!result.ok || result.state.lifecycle !== "ready") throw new Error("Editor initialization failed");
    return result.state;
  }
  connect(date: CalendarDate): EditingSession {
    this.get(date);
    const session = Object.freeze({ date, token: Symbol("editing-session") });
    this.sessions.set(date, session.token);
    return session;
  }
  disconnect(session: EditingSession) {
    if (this.sessions.get(session.date) === session.token) this.sessions.delete(session.date);
    // Ordinary unmount/navigation releases the binding, never the document.
  }
  dispatch(session: EditingSession, event: EditorEvent): TransitionResult {
    if (this.sessions.get(session.date) !== session.token) return { ok: false, reason: "stale-session" };
    // Workspace disposal is not an editing action. Releasing a session retains drafts.
    if (event.type === "dispose") return { ok: false, reason: "invalid-input" };
    const result = transitionEditor(this.get(session.date), event);
    if (result.ok && result.state.lifecycle === "ready") {
      this.documents.set(session.date, result.state);
      for (const listener of this.observers) listener(result.state);
      for (const listener of this.listeners.get(session.date) ?? []) listener();
    }
    return result;
  }
  subscribe(date: CalendarDate, listener: () => void) {
    let listeners = this.listeners.get(date);
    if (!listeners) { listeners = new Set(); this.listeners.set(date, listeners); }
    listeners.add(listener);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(date); };
  }
}

// A binding captures its date. Late input/cleanup from a replaced binding is rejected.
export class EditorController {
  private session: EditingSession | null = null;
  constructor(private readonly workspace: EditorWorkspace, readonly date: CalendarDate) {}
  getSnapshot = () => this.workspace.get(this.date);
  subscribe = (listener: () => void) => this.workspace.subscribe(this.date, listener);
  connect() {
    const session = this.workspace.connect(this.date);
    this.session = session;
    return () => {
      // An unfinished composition remains ordinary unsaved text on revisit.
      this.workspace.dispatch(session, { type: "composition", phase: "idle" });
      this.workspace.disconnect(session);
      if (this.session === session) this.session = null;
    };
  }
  dispatch = (event: EditorEvent): TransitionResult => this.session
    ? this.workspace.dispatch(this.session, event) : { ok: false, reason: "stale-session" };
}
