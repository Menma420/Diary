import { StrictMode, useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DiarySession } from "@/components/diary/DiarySession";
import { DiaryEditor } from "@/components/diary/DiaryEditor";
import { useDiaryEditor, type DiaryEditorBinding } from "@/components/diary/useDiaryEditor";
import { parseCalendarDate, type CalendarDate } from "@/lib/dates";
import { editorDirty, type EditorMode } from "@/lib/diary/editor-model";

const a = parseCalendarDate("2026-10-31")!; const b = parseCalendarDate("2026-11-01")!;
const ready = () => {};
afterEach(() => vi.restoreAllMocks());
function harness() {
  let binding: DiaryEditorBinding;
  function Editor({ date, mode }: { date: CalendarDate; mode: EditorMode }) {
    binding = useDiaryEditor(date); const ref = useRef<HTMLTextAreaElement>(null);
    return <><p id="preview-notice">Preview · not saved</p><DiaryEditor binding={binding} editorRef={ref} mode={mode} onReady={ready} /></>;
  }
  function Root({ date = a, mode = "editable" }: { date?: CalendarDate; mode?: EditorMode }) {
    return <StrictMode><DiarySession timeZone="Asia/Kolkata"><Editor date={date} mode={mode} /></DiarySession></StrictMode>;
  }
  return { Root, current: () => binding! };
}
it("renders controller replacements and clear events without remounting the textarea", () => {
  const { Root, current } = harness(); render(<Root />); const node = screen.getByRole("textbox");
  act(() => { current().controller.dispatch({ type: "replace", content: "  Programmatic 🌸\ntext" }); });
  expect(node).toHaveValue("  Programmatic 🌸\ntext"); expect(editorDirty(current().state)).toBe(true);
  act(() => { current().controller.dispatch({ type: "clear" }); });
  expect(screen.getByRole("textbox")).toBe(node); expect(node).toHaveValue(""); expect(current().state.document).not.toBeNull();
});
it("read-only prevents native and synthetic edits while preserving selection and content on mode changes", () => {
  const { Root, current } = harness(); const { rerender } = render(<Root />); const node = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.input(node, { target: { value: "Read me" } }); node.focus(); node.setSelectionRange(1, 4, "backward"); fireEvent.select(node);
  rerender(<Root mode="read-only" />); expect(node).toHaveAttribute("readonly"); expect(node).toHaveValue("Read me");
  fireEvent.input(node, { target: { value: "Forbidden" } }); expect(node).toHaveValue("Read me");
  expect(current().state.document?.content).toBe("Read me");
  rerender(<Root />); expect(node).not.toHaveAttribute("readonly");
  expect([node.selectionStart, node.selectionEnd, node.selectionDirection]).toEqual([1, 4, "backward"]);
  fireEvent.input(node, { target: { value: "Editable again" } }); expect(current().state.document?.content).toBe("Editable again");
});
it("composition preserves exact intermediate text and never reports a server save", () => {
  const { Root, current } = harness(); render(<Root />); const node = screen.getByRole("textbox");
  fireEvent.compositionStart(node); fireEvent.input(node, { target: { value: "に" }, isComposing: true });
  expect(current().state.composition).toBe("composing"); expect(current().state.document?.content).toBe("に");
  fireEvent.input(node, { target: { value: "日本 🌸" }, isComposing: true }); fireEvent.compositionEnd(node);
  expect(current().state.composition).toBe("idle"); expect(node).toHaveValue("日本 🌸");
  expect(screen.getByText("Preview · not saved")).toBeVisible(); expect(screen.queryByText(/^Saved$/)).not.toBeInTheDocument();
});
it("same-node date replacement and stale cleanup never copy another date's content", () => {
  const { Root, current } = harness(); const { rerender, unmount } = render(<Root />);
  fireEvent.input(screen.getByRole("textbox"), { target: { value: "Date A" } }); const previous = current();
  rerender(<Root date={b} />); expect(screen.getByRole("textbox")).toHaveValue("");
  fireEvent.input(screen.getByRole("textbox"), { target: { value: "Date B" } });
  expect(previous.controller.dispatch({ type: "clear" })).toEqual({ ok: false, reason: "stale-session" });
  rerender(<Root />); expect(screen.getByRole("textbox")).toHaveValue("Date A");
  unmount(); expect(current().controller.dispatch({ type: "clear" })).toEqual({ ok: false, reason: "stale-session" });
});
it("retains per-date selection and document scroll across remounts and removes listeners on unmount", () => {
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const remove = vi.spyOn(window, "removeEventListener");
  const { Root } = harness(); const { rerender, unmount } = render(<Root />);
  const node = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.input(node, { target: { value: "Remember my position" } }); node.setSelectionRange(2, 7, "backward"); fireEvent.select(node);
  const scrollY = vi.spyOn(window, "scrollY", "get").mockReturnValue(125); fireEvent.scroll(window);
  rerender(<Root date={b} />); scroll.mockClear(); scrollY.mockReturnValue(0); rerender(<Root />);
  const restored = screen.getByRole("textbox") as HTMLTextAreaElement;
  expect([restored.selectionStart, restored.selectionEnd, restored.selectionDirection]).toEqual([2, 7, "backward"]);
  expect(scroll).toHaveBeenCalledWith({ top: 125, behavior: "instant" });
  expect(restored).toHaveValue("Remember my position"); unmount();
  expect(remove.mock.calls.some(([type]) => type === "scroll")).toBe(true);
});
