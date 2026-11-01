import { parseCalendarDate, type CalendarDate } from "@/lib/dates";

export type EditorMode = "editable" | "read-only";
export type TextSelection = Readonly<{ start: number; end: number; direction: "forward" | "backward" | "none" }>;
export type EditorDocument = Readonly<{ date: CalendarDate; content: string }>;
type Identity = Readonly<{ date: CalendarDate; mode: EditorMode }>;
export type ReadyEditor = Identity & Readonly<{
  lifecycle: "ready";
  document: EditorDocument | null;
  baseline: EditorDocument | null;
  revision: number;
  selection: TextSelection;
  scrollY: number;
  composition: "idle" | "composing";
}>;
export type EditorState = (Identity & Readonly<{ lifecycle: "not-loaded" }>) | ReadyEditor |
  (Identity & Readonly<{ lifecycle: "disposed" }>);
export type EditorEvent =
  | { type: "load"; document: EditorDocument | null }
  | { type: "input"; content: string; selection: TextSelection }
  | { type: "replace"; content: string }
  | { type: "clear" }
  | { type: "position"; selection: TextSelection; scrollY: number }
  | { type: "mode"; mode: EditorMode }
  | { type: "composition"; phase: "idle" | "composing" }
  | { type: "dispose" };
export type TransitionFailure = "not-ready" | "already-loaded" | "disposed" | "read-only" | "composing" | "invalid-input" | "stale-session";
export type TransitionResult = { ok: true; state: EditorState } | { ok: false; reason: TransitionFailure };

const initialSelection: TextSelection = Object.freeze({ start: 0, end: 0, direction: "none" });
export const editorContent = (state: ReadyEditor) => state.document?.content ?? "";
// A missing document and a deliberately empty document have different identities.
export const editorDirty = (state: ReadyEditor) => (state.document === null) !== (state.baseline === null) || state.document?.content !== state.baseline?.content;
const validMode = (mode: EditorMode) => mode === "editable" || mode === "read-only";
function validSelection(selection: TextSelection, content: string) {
  return Number.isInteger(selection.start) && Number.isInteger(selection.end) && selection.start >= 0 &&
    selection.end >= selection.start && selection.end <= content.length && ["none", "forward", "backward"].includes(selection.direction);
}
export function initializeEditor(date: CalendarDate, mode: EditorMode = "editable"): EditorState {
  if (!parseCalendarDate(date) || !validMode(mode)) throw new RangeError("Invalid editor identity or mode");
  return Object.freeze({ lifecycle: "not-loaded", date, mode });
}
function ready(state: ReadyEditor): TransitionResult {
  return { ok: true, state: Object.freeze(state) };
}
export function transitionEditor(state: EditorState, event: EditorEvent): TransitionResult {
  if (state.lifecycle === "disposed") return { ok: false, reason: "disposed" };
  if (event.type === "dispose") return { ok: true, state: Object.freeze({ lifecycle: "disposed", date: state.date, mode: state.mode }) };
  if (event.type === "load") {
    if (state.lifecycle !== "not-loaded") return { ok: false, reason: "already-loaded" };
    if (event.document !== null && (event.document.date !== state.date || typeof event.document.content !== "string")) return { ok: false, reason: "invalid-input" };
    const document = event.document === null ? null : Object.freeze({ ...event.document });
    const end = document?.content.length ?? 0;
    return ready({ ...state, lifecycle: "ready", document, baseline: document, revision: 0,
      selection: Object.freeze({ ...initialSelection, start: end, end }), scrollY: 0, composition: "idle" });
  }
  if (state.lifecycle !== "ready") return { ok: false, reason: "not-ready" };
  switch (event.type) {
    case "mode":
      if (!validMode(event.mode)) return { ok: false, reason: "invalid-input" };
      return ready({ ...state, mode: event.mode, composition: event.mode === "read-only" ? "idle" : state.composition });
    case "position":
      if (!validSelection(event.selection, editorContent(state)) || !Number.isFinite(event.scrollY) || event.scrollY < 0) return { ok: false, reason: "invalid-input" };
      return ready({ ...state, selection: Object.freeze({ ...event.selection }), scrollY: event.scrollY });
    case "composition":
      if (state.mode === "read-only") return { ok: false, reason: "read-only" };
      if (event.phase !== "idle" && event.phase !== "composing") return { ok: false, reason: "invalid-input" };
      return ready({ ...state, composition: event.phase });
    case "input":
    case "replace":
    case "clear": {
      if (state.mode === "read-only") return { ok: false, reason: "read-only" };
      if (state.composition === "composing" && event.type !== "input") return { ok: false, reason: "composing" };
      const content = event.type === "clear" ? "" : event.content;
      if (typeof content !== "string") return { ok: false, reason: "invalid-input" };
      const selection = event.type === "input" ? event.selection : { start: content.length, end: content.length, direction: "none" as const };
      if (!validSelection(selection, content)) return { ok: false, reason: "invalid-input" };
      const changed = content !== editorContent(state) || (state.document === null && event.type !== "input");
      if (changed && state.revision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "invalid-input" };
      return ready({ ...state, document: changed ? Object.freeze({ date: state.date, content }) : state.document,
        revision: state.revision + Number(changed), selection: Object.freeze({ ...selection }) });
    }
    default: {
      const unexpected: never = event;
      void unexpected;
      return { ok: false, reason: "invalid-input" };
    }
  }
}
