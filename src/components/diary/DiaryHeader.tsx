import { themes, type ThemeId } from "@/themes/themes";
import styles from "./DiaryPreview.module.css";

type Props = {
  dateIndex: number;
  theme: ThemeId;
  onRememberFocus: (event: PointerEvent<HTMLElement>) => void;
  onCancelFocus: () => void;
  onDateChange: (index: number) => void;
  onThemeChange: (theme: ThemeId) => void;
};

function Arrow({ forward = false }: { forward?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={forward ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DiaryHeader({ dateIndex, theme, onRememberFocus, onCancelFocus, onDateChange, onThemeChange }: Props) {
  return (
    <header className={styles.header} onPointerCancel={onCancelFocus} onKeyDown={onCancelFocus}>
      <h1 className={styles.identity}>MY LITTLE DIARY <span aria-hidden="true">♡</span></h1>
      <div className={styles.controls}>
        <nav className={styles.navigation} aria-label="Preview dates" aria-describedby="preview-controls-help">
          <button className={styles.iconButton} type="button" aria-label="Previous preview date" disabled={dateIndex === 0}
            onPointerDown={onRememberFocus} onClick={() => onDateChange(dateIndex - 1)}><Arrow /></button>
          <button className={styles.todayButton} type="button" title="Reference date: 31 October 2026"
            onPointerDown={onRememberFocus} onClick={() => onDateChange(1)}>Today</button>
          <button className={styles.iconButton} type="button" aria-label="Next preview date" disabled={dateIndex === 2}
            onPointerDown={onRememberFocus} onClick={() => onDateChange(dateIndex + 1)}><Arrow forward /></button>
        </nav>
        <label className={styles.appearance} title="Preview a theme">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z" />
            <circle cx="7.5" cy="10" r="1" fill="currentColor" /><circle cx="11" cy="6.8" r="1" fill="currentColor" />
            <circle cx="16" cy="8" r="1" fill="currentColor" /><circle cx="7.5" cy="15" r="1" fill="currentColor" />
          </svg>
          <span className="srOnly">Theme preview</span>
          <select value={theme} onPointerDown={onRememberFocus} onChange={(event) => onThemeChange(event.target.value as ThemeId)}>
            {themes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      <p id="preview-controls-help" className="srOnly">Visual preview of 30 October through 1 November 2026. Today returns to the reference date. Writing stays on this preview page and is not saved.</p>
    </header>
  );
}
import type { PointerEvent } from "react";
