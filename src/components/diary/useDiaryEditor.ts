"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { CalendarDate } from "@/lib/dates";
import { EditorController } from "@/lib/diary/editor-workspace";
import { editorContent, type TextSelection } from "@/lib/diary/editor-model";
import { useDiarySession } from "./DiarySession";

export const textareaSelection = (node: HTMLTextAreaElement): TextSelection => ({ start: node.selectionStart, end: node.selectionEnd, direction: node.selectionDirection });
export function useDiaryEditor(date: CalendarDate) {
  const { workspace, persistence } = useDiarySession();
  useEffect(() => { if (persistence) void persistence.open(date); }, [persistence,date]);
  const controller = useMemo(() => new EditorController(workspace, date), [workspace, date]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const capture = useCallback((node: HTMLTextAreaElement) => {
    // Cleanup must never read a reused DOM node that already displays another date.
    const current = controller.getSnapshot();
    if (node.dataset.editorDate !== date || node.value !== editorContent(current)) return;
    controller.dispatch({ type: "position", selection: textareaSelection(node), scrollY: Math.max(0, window.scrollY) });
  }, [controller, date]);
  return { controller, state, capture };
}
export type DiaryEditorBinding = ReturnType<typeof useDiaryEditor>;
