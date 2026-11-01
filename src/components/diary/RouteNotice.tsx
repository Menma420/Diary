import Link from "next/link";
import styles from "./DiaryPreview.module.css";
import paper from "./DiaryPaper.module.css";

export function RouteNotice({ title, children }: { title: string; children?: React.ReactNode }) {
  return <main className={styles.stage}><div className={styles.diary}>
    <header className={styles.header}><h1 className={styles.identity}>MY LITTLE DIARY ♡</h1></header>
    <section className={paper.paper}><div className={paper.writing}><h2>{title}</h2>{children}</div></section>
    <footer className={styles.footer}><Link href="/diary">Go to today</Link></footer>
  </div></main>;
}
