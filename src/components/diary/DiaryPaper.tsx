import Image from "next/image";
import { useLayoutEffect, type RefObject } from "react";
import { PaperDate } from "./PaperDate";
import styles from "./DiaryPaper.module.css";
import type { MemoryDraft } from "./DiarySession";

const decorations = [
  { position: "topLeft", asset: "flower" },
  { position: "topRight", asset: "berry" },
  { position: "bottomLeft", asset: "cat" },
  { position: "bottomRight", asset: "hearts" },
] as const;

type Props = {
  date: { value: string; label: string };
  editorRef: RefObject<HTMLTextAreaElement | null>;
  draft: MemoryDraft;
  onSnapshot: (node: HTMLTextAreaElement) => void;
  onReady: () => void;
};

function fitTextarea(node: HTMLTextAreaElement) {
  const scrollY = window.scrollY;
  node.style.height = "0px";
  node.style.height = `${node.scrollHeight}px`;
  if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, behavior: "instant" });
}

export function DiaryPaper({ date, editorRef, draft, onSnapshot, onReady }: Props) {
  function resize() {
    const node = editorRef.current;
    if (!node) return;
    fitTextarea(node);
    onSnapshot(node);
  }

  useLayoutEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    node.value = draft.text;
    fitTextarea(node);
    node.setSelectionRange(draft.start, draft.end, draft.direction);
    if (window.scrollY !== draft.scrollY) window.scrollTo({ top: draft.scrollY, behavior: "instant" });
    onReady();
    let width = node.parentElement?.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width !== width) {
        width = entry.contentRect.width;
        fitTextarea(node);
      }
    });
    if (node.parentElement) observer.observe(node.parentElement);
    const fitOnViewportResize = () => fitTextarea(node);
    window.addEventListener("resize", fitOnViewportResize);
    return () => {
      onSnapshot(node);
      observer.disconnect();
      window.removeEventListener("resize", fitOnViewportResize);
    };
  }, [date.value, draft, editorRef, onReady, onSnapshot]);

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
        <label className="srOnly" htmlFor="diary-writing">Diary writing preview</label>
        <textarea id="diary-writing" ref={editorRef} className={styles.editor} placeholder="Today was..."
          defaultValue={draft.text} aria-describedby="preview-notice writing-help" spellCheck rows={4} onInput={resize}
          onSelect={(event) => onSnapshot(event.currentTarget)} onBlur={(event) => onSnapshot(event.currentTarget)} />
        <p id="writing-help" className="srOnly">Writing belongs to this date and stays in this tab during navigation. Reloading or closing the tab clears all temporary drafts.</p>
      </div>
    </section>
  );
}
