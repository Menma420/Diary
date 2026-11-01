"use client";

import { useLayoutEffect, type RefObject } from "react";
import { editorContent, type EditorMode } from "@/lib/diary/editor-model";
import { textareaSelection, type DiaryEditorBinding } from "./useDiaryEditor";
import styles from "./DiaryPaper.module.css";

type Props = { binding: DiaryEditorBinding; editorRef: RefObject<HTMLTextAreaElement | null>; mode: EditorMode; onReady: () => void };
function fitTextarea(node: HTMLTextAreaElement) {
  const scrollY = window.scrollY;
  node.style.height = "0px";
  node.style.height = `${node.scrollHeight}px`;
  if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, behavior: "instant" });
}
export function DiaryEditor({ binding: { controller, state, capture }, editorRef, mode, onReady }: Props) {
  const content = editorContent(state);
  useLayoutEffect(() => {
    const disconnect = controller.connect();
    const node = editorRef.current;
    if (!node) return disconnect;
    const current = controller.getSnapshot();
    fitTextarea(node);
    node.setSelectionRange(current.selection.start, current.selection.end, current.selection.direction);
    if (window.scrollY !== current.scrollY) window.scrollTo({ top: current.scrollY, behavior: "instant" });
    onReady();
    let width = node.parentElement?.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width !== width) { width = entry.contentRect.width; fitTextarea(node); }
    });
    if (node.parentElement) observer.observe(node.parentElement);
    const resize = () => fitTextarea(node);
    const scroll = () => capture(node);
    let mounted = true;
    void document.fonts?.ready.then(() => { if (mounted) fitTextarea(node); });
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      mounted = false;
      capture(node);
      disconnect();
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", scroll);
    };
    // Mode has its own transition; it must not reconnect or restore the caret.
  }, [controller, editorRef, capture, onReady]);
  useLayoutEffect(() => { controller.dispatch({ type: "mode", mode }); }, [controller, mode]);
  useLayoutEffect(() => { if (editorRef.current) fitTextarea(editorRef.current); }, [content, editorRef]);

  function input(node: HTMLTextAreaElement) {
    const result = controller.dispatch({ type: "input", content: node.value, selection: textareaSelection(node) });
    if (!result.ok) {
      // Native readOnly prevents ordinary edits; reject synthetic/stale input too.
      const current = controller.getSnapshot();
      node.value = editorContent(current);
      node.setSelectionRange(current.selection.start, current.selection.end, current.selection.direction);
    }
  }
  return <>
    <label className="srOnly" htmlFor="diary-writing">Diary writing preview</label>
    <textarea id="diary-writing" ref={editorRef} className={styles.editor} placeholder="Today was..."
      data-editor-date={state.date} value={content} readOnly={mode === "read-only"} aria-describedby="preview-notice writing-help" spellCheck rows={4}
      onChange={(event) => input(event.currentTarget)}
      onSelect={(event) => capture(event.currentTarget)} onBlur={(event) => capture(event.currentTarget)}
      onCompositionStart={() => controller.dispatch({ type: "composition", phase: "composing" })}
      onCompositionEnd={(event) => { input(event.currentTarget); controller.dispatch({ type: "composition", phase: "idle" }); }} />
    <p id="writing-help" className="srOnly">Writing belongs to this date and stays in this tab during navigation. Reloading or closing the tab clears all temporary drafts.</p>
  </>;
}
