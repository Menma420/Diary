"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { DEFAULT_THEME, type ThemeId } from "@/themes/themes";
import { DiaryHeader } from "./DiaryHeader";
import { DiaryPaper } from "./DiaryPaper";
import styles from "./DiaryPreview.module.css";

// Visual fixtures only. Calendar arithmetic, date URLs, and date-owned drafts
// belong to Phases 3–4. This preview has one volatile writing surface.
export const PREVIEW_DATES = [
  { value: "2026-10-30", label: "30 October 2026" },
  { value: "2026-10-31", label: "31 October 2026" },
  { value: "2026-11-01", label: "1 November 2026" },
] as const;

type Selection = { start: number; end: number; direction: "forward" | "backward" | "none"; control: HTMLElement };

export function DiaryPreview() {
  const [dateIndex, setDateIndex] = useState(1);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const editor = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<Selection | null>(null);
  const date = PREVIEW_DATES[dateIndex]!;

  useEffect(() => {
    return () => { document.documentElement.dataset.theme = DEFAULT_THEME; };
  }, []);

  function rememberEditingFocus(event: PointerEvent<HTMLElement>) {
    const node = editor.current;
    selection.current = node && document.activeElement === node
      ? { start: node.selectionStart, end: node.selectionEnd, direction: node.selectionDirection, control: event.currentTarget }
      : null;
  }

  function restoreEditingFocus() {
    const remembered = selection.current;
    selection.current = null;
    const active = document.activeElement;
    if (remembered && editor.current && (active === editor.current || active === remembered.control)) {
      editor.current.focus({ preventScroll: true });
      editor.current.setSelectionRange(remembered.start, remembered.end, remembered.direction);
    }
  }

  function changeDate(index: number) {
    setDateIndex(index);
    restoreEditingFocus();
  }

  function changeTheme(next: ThemeId) {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    restoreEditingFocus();
  }

  return (
    <main className={styles.stage}>
      <div className={styles.diary} data-theme={theme}>
        <DiaryHeader
          dateIndex={dateIndex}
          theme={theme}
          onRememberFocus={rememberEditingFocus}
          onCancelFocus={() => { selection.current = null; }}
          onDateChange={changeDate}
          onThemeChange={changeTheme}
        />
        <DiaryPaper date={date} editorRef={editor} />
        <footer className={styles.footer}>
          <div>
            <p className={styles.caption}>A little space for your thoughts <span aria-hidden="true">♡</span></p>
            <p className={styles.assetNote}>Temporary original illustrations</p>
          </div>
          <p id="preview-notice" className={styles.previewNotice}>Preview · not saved</p>
        </footer>
      </div>
    </main>
  );
}
