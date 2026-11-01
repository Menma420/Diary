import { describe, expect, it, vi } from "vitest";
import { parseCalendarDate, type CalendarDate } from "@/lib/dates";
import { editorContent, editorDirty, initializeEditor, transitionEditor, type EditorEvent, type EditorState, type ReadyEditor } from "@/lib/diary/editor-model";
import { EditorController, EditorWorkspace } from "@/lib/diary/editor-workspace";

const a = parseCalendarDate("2026-10-31")!;
const b = parseCalendarDate("2026-11-01")!;
const selection = (start: number, end = start) => ({ start, end, direction: "backward" as const });
function apply(state: EditorState, event: EditorEvent): ReadyEditor {
  const result = transitionEditor(state, event);
  if (!result.ok || result.state.lifecycle !== "ready") throw new Error("Expected ready transition");
  return result.state;
}
const missing = () => apply(initializeEditor(a), { type: "load", document: null });

describe("editor domain transitions", () => {
  it("starts unavailable until explicitly initialized with a known document or missing result", () => {
    const initial = initializeEditor(a);
    expect(initial.lifecycle).toBe("not-loaded");
    expect(transitionEditor(initial, { type: "clear" })).toEqual({ ok: false, reason: "not-ready" });
    const state = missing();
    expect([state.document, state.baseline, state.revision, state.mode, state.composition]).toEqual([null, null, 0, "editable", "idle"]);
    expect(editorDirty(state)).toBe(false);
  });
  it("rejects invalid initialization and cross-date documents", () => {
    expect(() => initializeEditor("2026-02-29" as CalendarDate)).toThrow(RangeError);
    expect(transitionEditor(initializeEditor(a), { type: "load", document: { date: b, content: "Wrong date" } })).toEqual({ ok: false, reason: "invalid-input" });
  });
  it("keeps an existing empty document distinct from a missing document", () => {
    const empty = apply(initializeEditor(a), { type: "load", document: { date: a, content: "" } });
    expect(empty.document).toEqual({ date: a, content: "" });
    expect(editorContent(empty)).toBe(editorContent(missing()));
    expect(editorDirty(empty)).toBe(false);
  });
  it("retains whitespace, line breaks, Unicode and immutable previous snapshots", () => {
    const first = missing(); const content = "  Hello 🌸\n世界\n";
    const next = apply(first, { type: "input", content, selection: selection(2, 5) });
    expect(editorContent(next)).toBe(content); expect(editorDirty(next)).toBe(true);
    expect(next.revision).toBe(1); expect(first.document).toBeNull();
    expect(Object.isFrozen(next)).toBe(true); expect(Object.isFrozen(next.document)).toBe(true);
  });
  it("represents clearing as an explicit empty document even for a previously missing date", () => {
    const empty = apply(missing(), { type: "clear" });
    expect(empty.document).toEqual({ date: a, content: "" }); expect(editorDirty(empty)).toBe(true);
    expect(apply(empty, { type: "clear" }).revision).toBe(1);
  });
  it("replaces all content, retains cleared documents and returns to a present baseline", () => {
    const baseline = apply(initializeEditor(a), { type: "load", document: { date: a, content: "Original" } });
    const changed = apply(baseline, { type: "replace", content: "Replacement" });
    expect(changed.selection.start).toBe(11); expect(editorDirty(changed)).toBe(true);
    const empty = apply(changed, { type: "clear" });
    expect(empty.document?.content).toBe(""); expect(empty.baseline?.content).toBe("Original");
    const reverted = apply(empty, { type: "replace", content: "Original" });
    expect(editorDirty(reverted)).toBe(false); expect(reverted.revision).toBe(3);
  });
  it("selection and scroll are independent of content revisions and dirtiness", () => {
    const baseline = apply(initializeEditor(a), { type: "load", document: { date: a, content: "A quiet day" } });
    expect(baseline.selection.start).toBe(11);
    const next = apply(baseline, { type: "position", selection: selection(2, 6), scrollY: 500 });
    expect(next.selection).toEqual(selection(2, 6)); expect(next.scrollY).toBe(500);
    expect(next.revision).toBe(0); expect(editorDirty(next)).toBe(false);
  });
  it.each([
    { type: "position", selection: selection(-1), scrollY: 0 },
    { type: "position", selection: selection(0, 1), scrollY: 0 },
    { type: "position", selection: selection(0), scrollY: Number.NaN },
    { type: "position", selection: selection(0), scrollY: -1 },
  ] satisfies EditorEvent[])("rejects invalid positions without changing state: %j", (event) => {
    const state = missing(); expect(transitionEditor(state, event)).toEqual({ ok: false, reason: "invalid-input" }); expect(state.revision).toBe(0);
  });
  it("prevents a late load from replacing an editable draft", () => {
    const state = apply(missing(), { type: "replace", content: "Local writing" });
    expect(transitionEditor(state, { type: "load", document: null })).toEqual({ ok: false, reason: "already-loaded" });
    expect(editorContent(state)).toBe("Local writing");
  });
  it("allows selection and mode changes while read-only but rejects all content edits", () => {
    const state = apply(missing(), { type: "mode", mode: "read-only" });
    for (const event of [{ type: "clear" }, { type: "replace", content: "X" }, { type: "input", content: "X", selection: selection(1) }, { type: "composition", phase: "composing" }] satisfies EditorEvent[]) {
      expect(transitionEditor(state, event)).toEqual({ ok: false, reason: "read-only" });
    }
    expect(apply(state, { type: "position", selection: selection(0), scrollY: 10 }).scrollY).toBe(10);
    expect(apply(state, { type: "mode", mode: "editable" }).mode).toBe("editable");
  });
  it("records composing text without permitting programmatic replacement until composition ends", () => {
    let state = apply(missing(), { type: "composition", phase: "composing" });
    state = apply(state, { type: "input", content: "日", selection: selection(1) });
    expect(state.composition).toBe("composing");
    expect(transitionEditor(state, { type: "replace", content: "Other" })).toEqual({ ok: false, reason: "composing" });
    expect(transitionEditor(state, { type: "clear" })).toEqual({ ok: false, reason: "composing" });
    state = apply(state, { type: "composition", phase: "idle" });
    expect(editorContent(state)).toBe("日"); expect(state.revision).toBe(1);
  });
  it("disposal is terminal and cannot load or edit another session", () => {
    const disposed = transitionEditor(missing(), { type: "dispose" });
    if (!disposed.ok) throw new Error("Disposal failed");
    expect(disposed.state.lifecycle).toBe("disposed");
    expect(transitionEditor(disposed.state, { type: "clear" })).toEqual({ ok: false, reason: "disposed" });
  });
});

describe("per-date workspace and editing sessions", () => {
  it("isolates date state and retains explicit clearing across reconnection", () => {
    const workspace = new EditorWorkspace(); const first = workspace.connect(a); const second = workspace.connect(b);
    workspace.dispatch(first, { type: "replace", content: "Date A" }); workspace.dispatch(second, { type: "replace", content: "Date B" });
    workspace.dispatch(first, { type: "clear" }); workspace.disconnect(first);
    expect(workspace.get(a).document).toEqual({ date: a, content: "" }); expect(editorContent(workspace.get(b))).toBe("Date B");
    expect(workspace.connect(a).date).toBe(a); expect(workspace.get(a).revision).toBe(2);
  });
  it("loads a known draft once and refuses later replacements through the load boundary", () => {
    const workspace = new EditorWorkspace();
    expect(workspace.load(a, { date: a, content: "Known draft" }).ok).toBe(true);
    expect(workspace.get(a).selection.start).toBe(11);
    expect(workspace.load(a, null)).toEqual({ ok: false, reason: "already-loaded" });
    expect(editorContent(workspace.get(a))).toBe("Known draft");
  });
  it("rejects input and cleanup from superseded sessions, retaining the replacement", () => {
    const workspace = new EditorWorkspace(); const old = new EditorController(workspace, a); const current = new EditorController(workspace, a);
    const releaseOld = old.connect(); old.dispatch({ type: "replace", content: "Old draft" });
    const releaseCurrent = current.connect(); current.dispatch({ type: "replace", content: "New draft" });
    expect(old.dispatch({ type: "clear" })).toEqual({ ok: false, reason: "stale-session" }); releaseOld();
    expect(current.dispatch({ type: "replace", content: "Still active" }).ok).toBe(true);
    releaseCurrent(); expect(current.dispatch({ type: "clear" })).toEqual({ ok: false, reason: "stale-session" });
    expect(editorContent(workspace.get(a))).toBe("Still active");
  });
  it("notifies only subscribers for the changed date and removes subscriptions", () => {
    const workspace = new EditorWorkspace(); workspace.get(a); workspace.get(b);
    const listener = vi.fn(); const other = vi.fn(); const unsubscribe = workspace.subscribe(a, listener); workspace.subscribe(b, other);
    const session = workspace.connect(a); workspace.dispatch(session, { type: "clear" });
    expect(listener).toHaveBeenCalledOnce(); expect(other).not.toHaveBeenCalled();
    unsubscribe(); workspace.dispatch(session, { type: "replace", content: "Later" }); expect(listener).toHaveBeenCalledOnce();
  });
  it("navigation detaches composition while retaining text, position and revision", () => {
    const workspace = new EditorWorkspace(); const controller = new EditorController(workspace, a); const release = controller.connect();
    controller.dispatch({ type: "composition", phase: "composing" }); controller.dispatch({ type: "input", content: "日本", selection: selection(1, 2) });
    controller.dispatch({ type: "position", selection: selection(1, 2), scrollY: 200 }); release();
    const next = new EditorController(workspace, a); const disconnect = next.connect();
    expect(next.getSnapshot()).toMatchObject({ composition: "idle", revision: 1, selection: selection(1, 2), scrollY: 200 });
    expect(editorContent(next.getSnapshot())).toBe("日本"); disconnect();
  });
  it("does not expose document disposal as an ordinary workspace input", () => {
    const workspace = new EditorWorkspace(); const session = workspace.connect(a);
    expect(workspace.dispatch(session, { type: "dispose" })).toEqual({ ok: false, reason: "invalid-input" });
    expect(workspace.get(a).lifecycle).toBe("ready");
  });
});
