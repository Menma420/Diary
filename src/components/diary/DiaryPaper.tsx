import type { RefObject } from "react";
import { PaperDate } from "./PaperDate";
import styles from "./DiaryPaper.module.css";
import { DiaryEditor } from "./DiaryEditor";
import type { DiaryEditorBinding } from "./useDiaryEditor";
import type { EditorMode } from "@/lib/diary/editor-model";
import type { CalendarDate } from "@/lib/dates";
import { DecorationLayer } from "./DecorationLayer";

type Props = {
  date: { value: CalendarDate; label: string };
  editorRef: RefObject<HTMLTextAreaElement | null>;
  binding: DiaryEditorBinding;
  mode: EditorMode;
  onReady: () => void;
};

export function DiaryPaper({ date, editorRef, binding, mode, onReady }: Props) {
  return (
    <section className={styles.paper} aria-label="Diary paper">
      <PaperDate {...date} />
      <DecorationLayer date={date.value} />
      <div className={styles.writing}>
        <p className={styles.salutation} aria-hidden="true">Dear diary...</p>
        <DiaryEditor key={date.value} binding={binding} editorRef={editorRef} mode={mode} onReady={onReady} />
      </div>
    </section>
  );
}
