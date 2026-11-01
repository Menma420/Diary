import Image from "next/image";
import type { RefObject } from "react";
import { PaperDate } from "./PaperDate";
import styles from "./DiaryPaper.module.css";
import { DiaryEditor } from "./DiaryEditor";
import type { DiaryEditorBinding } from "./useDiaryEditor";
import type { EditorMode } from "@/lib/diary/editor-model";

const decorations = [
  { position: "topLeft", asset: "flower" },
  { position: "topRight", asset: "berry" },
  { position: "bottomLeft", asset: "cat" },
  { position: "bottomRight", asset: "hearts" },
] as const;

type Props = {
  date: { value: string; label: string };
  editorRef: RefObject<HTMLTextAreaElement | null>;
  binding: DiaryEditorBinding;
  mode: EditorMode;
  onReady: () => void;
};

export function DiaryPaper({ date, editorRef, binding, mode, onReady }: Props) {
  return (
    <section className={styles.paper} aria-label="Diary paper">
      <PaperDate {...date} />
      <div className={styles.decorations} aria-hidden="true" data-artwork="temporary-original-svg">
        {decorations.map(({ position, asset }) => (
          <div className={`${styles.sticker} ${styles[position]}`} key={position}>
            <Image src={`/decorations/temporary/${asset}.svg`} width={88} height={88} alt="" draggable={false} loading="eager" unoptimized />
          </div>
        ))}
      </div>
      <div className={styles.writing}>
        <p className={styles.salutation} aria-hidden="true">Dear diary...</p>
        <DiaryEditor key={date.value} binding={binding} editorRef={editorRef} mode={mode} onReady={onReady} />
      </div>
    </section>
  );
}
