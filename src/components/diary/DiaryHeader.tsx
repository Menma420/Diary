import { themes, type ThemeId } from "@/themes/themes";
import styles from "./DiaryPreview.module.css";
import { useState, type RefObject } from "react";
import { addDays, today, type CalendarDate } from "@/lib/dates";
import { CalendarPicker } from "./CalendarPicker";

type Props = {
  date: CalendarDate;
  timeZone: string;
  calendarTrigger: RefObject<HTMLButtonElement | null>;
  theme: ThemeId;
  onRememberFocus: (event: PointerEvent<HTMLElement>) => void;
  onCancelFocus: () => void;
  onDateChange: (date: CalendarDate, calendar?: boolean) => void;
  onThemeChange: (theme: ThemeId) => void;
};

function Arrow({ forward = false }: { forward?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={forward ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DiaryHeader({ date, timeZone, calendarTrigger, theme, onRememberFocus, onCancelFocus, onDateChange, onThemeChange }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const previous = addDays(date, -1);
  const next = addDays(date, 1);
  return (
    <header className={styles.header} onPointerCancel={onCancelFocus} onKeyDown={onCancelFocus}>
      <h1 className={styles.identity}>MY LITTLE DIARY <span aria-hidden="true">♡</span></h1>
      <div className={styles.controls}>
        <nav className={styles.navigation} aria-label="Diary dates">
          <button className={styles.iconButton} type="button" aria-label="Previous day" disabled={!previous}
            onPointerDown={onRememberFocus} onClick={() => previous && onDateChange(previous)}><Arrow /></button>
          <button className={styles.todayButton} type="button" title={`Today in ${timeZone}`}
            onPointerDown={onRememberFocus} onClick={() => onDateChange(today(timeZone))}>Today</button>
          <button className={styles.iconButton} type="button" aria-label="Next day" disabled={!next}
            onPointerDown={onRememberFocus} onClick={() => next && onDateChange(next)}><Arrow forward /></button>
          <button ref={calendarTrigger} className={styles.iconButton} type="button" aria-label="Open calendar" aria-haspopup="dialog"
            onClick={() => { onCancelFocus(); setCalendarOpen(true); }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3" /></svg>
          </button>
        </nav>
        <label className={styles.appearance} title="Choose a theme">
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
      {calendarOpen && <CalendarPicker selected={date} timeZone={timeZone} onClose={() => setCalendarOpen(false)} onSelect={(next) => onDateChange(next, true)} />}
    </header>
  );
}
import type { PointerEvent } from "react";
