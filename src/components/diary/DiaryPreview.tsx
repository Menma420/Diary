"use client";

import { useCallback, useRef, useSyncExternalStore, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { diaryPath, formatDate, type CalendarDate } from "@/lib/dates";
import type { ThemeId } from "@/themes/themes";
import { useDiarySession } from "./DiarySession";
import { DiaryHeader } from "./DiaryHeader";
import { DiaryPaper } from "./DiaryPaper";
import styles from "./DiaryPreview.module.css";
import { useDiaryEditor } from "./useDiaryEditor";
import type { EditorMode } from "@/lib/diary/editor-model";
import { SaveFeedback, RecoveryNotice } from "./SaveFeedback";
import { LogoutControl } from "@/components/auth/SessionControls";

type Selection = { start: number; end: number; direction: "forward" | "backward" | "none"; control: HTMLElement };

export function DiaryPreview({ date, mode = "editable" }: { date: CalendarDate; mode?: EditorMode }) {
  const router = useRouter();
  const { focusRef, theme, setTheme, timeZone, persistence } = useDiarySession();
  const status = useSyncExternalStore(persistence?.subscribe ?? (() => () => {}), () => persistence?.snapshot(date) ?? null, () => null);
  const binding = useDiaryEditor(date);
  const editor = useRef<HTMLTextAreaElement>(null);
  const navigationVersion=useRef(0);
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

  async function changeDate(next: CalendarDate, calendar = false) {
    const generation=++navigationVersion.current;
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
    if (persistence) await persistence.flushLocal();
    if (generation!==navigationVersion.current) return;
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
        <DiaryPaper date={{ value: date, label: formatDate(date) }} binding={binding} mode={mode === "read-only" || (persistence && (!status || !status.ready || ["loading","load-failed","conflict"].includes(status.phase))) ? "read-only" : "editable"} editorRef={editor} onReady={restore} />
        <footer className={styles.footer}>
          <div>
            <p className={styles.caption}>A little space for your thoughts <span aria-hidden="true">♡</span></p>
            <p className={styles.assetNote}><span>Temporary original illustrations</span><LogoutControl /></p>
          </div>
          <SaveFeedback date={date} />
        </footer>
        <RecoveryNotice currentDate={date} />
      </div>
    </main>
  );
}
