import styles from "./DiaryPaper.module.css";

export function PaperDate({ value, label }: { value: string; label: string }) {
  return <time className={styles.date} dateTime={value} aria-live="polite" aria-atomic="true">{label}</time>;
}
