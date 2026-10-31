import Image from "next/image";
import { useLayoutEffect, type RefObject } from "react";
import { PaperDate } from "./PaperDate";
import styles from "./DiaryPaper.module.css";

const decorations = [
  { position: "topLeft", asset: "flower" },
  { position: "topRight", asset: "berry" },
  { position: "bottomLeft", asset: "cat" },
  { position: "bottomRight", asset: "hearts" },
] as const;

type Props = {
  date: { value: string; label: string };
  editorRef: RefObject<HTMLTextAreaElement | null>;
};

function fitTextarea(node: HTMLTextAreaElement) {
  const scrollY = window.scrollY;
  node.style.height = "0px";
  node.style.height = `${node.scrollHeight}px`;
  if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, behavior: "instant" });
}

export function DiaryPaper({ date, editorRef }: Props) {
  function resize() {
    const node = editorRef.current;
    if (!node) return;
    fitTextarea(node);
  }

  useLayoutEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    fitTextarea(node);
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
      observer.disconnect();
      window.removeEventListener("resize", fitOnViewportResize);
    };
  }, [editorRef]);

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
          aria-describedby="preview-notice" spellCheck rows={4} onInput={resize} />
      </div>
    </section>
  );
}
