"use client";

import { useCallback, useRef, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { diaryPath, formatDate, type CalendarDate } from "@/lib/dates";
import type { ThemeId } from "@/themes/themes";
import { useDiarySession } from "./DiarySession";
import { DiaryHeader } from "./DiaryHeader";
import { DiaryPaper } from "./DiaryPaper";
import styles from "./DiaryPreview.module.css";
import { useDiaryEditor } from "./useDiaryEditor";
import type { EditorMode } from "@/lib/diary/editor-model";
import { LogoutControl } from "@/components/auth/SessionControls";

type Selection = { start: number; end: number; direction: "forward" | "backward" | "none"; control: HTMLElement };

export function DiaryPreview({ date, mode = "editable" }: { date: CalendarDate; mode?: EditorMode }) {
  const router = useRouter();
  const { focusRef, theme, setTheme, timeZone } = useDiarySession();
  const binding = useDiaryEditor(date);
  const editor = useRef<HTMLTextAreaElement>(null);
  const calendarTrigger = useRef<HTMLButtonElement>(null);
  const selection = useRef<Selection | null>(null);
  const restore = useCallback(() => {
    const intent = focusRef.current;
    const active = document.activeElement;
    if (intent?.date === date) {
      focusRef.current = null;
      if (active === document.body || active === intent.source || active === intent.control) {
        (intent.calendar ? calendarTrigger.current : editor.current)?.focus({ preventScroll: true });
      }
    }
  }, [date, focusRef]);

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

  function changeDate(next: CalendarDate, calendar = false) {
    const node = editor.current;
    if (node) binding.capture(node);
    if (next === date) {
      if (!calendar) restoreEditingFocus();
      return;
    }
    const remembered = selection.current;
    selection.current = null;
    const active = document.activeElement;
    const fromWriting = remembered && (active === node || active === remembered.control);
    focusRef.current = node && (calendar || fromWriting)
      ? { date: next, source: node, control: calendar ? calendarTrigger.current! : remembered!.control, calendar }
      : null;
    router.push(diaryPath(next), { scroll: false });
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
          date={date}
          timeZone={timeZone}
          calendarTrigger={calendarTrigger}
          theme={theme}
          onRememberFocus={rememberEditingFocus}
          onCancelFocus={() => { selection.current = null; focusRef.current = null; }}
          onDateChange={changeDate}
          onThemeChange={changeTheme}
        />
        <DiaryPaper date={{ value: date, label: formatDate(date) }} binding={binding} mode={mode} editorRef={editor} onReady={restore} />
        <footer className={styles.footer}>
          <div>
            <p className={styles.caption}>A little space for your thoughts <span aria-hidden="true">♡</span></p>
            <p className={styles.assetNote}><span>Temporary original illustrations</span><LogoutControl /></p>
          </div>
          <p id="preview-notice" className={styles.previewNotice}>Preview · not saved</p>
        </footer>
      </div>
    </main>
  );
}
