import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { addDays, addMonths, calendarDate, daysInMonth, formatDate, MONTHS, parseDisplayDate, parts, today, weekday, type CalendarDate } from "@/lib/dates";
import styles from "./CalendarPicker.module.css";

export function CalendarPicker({ selected, timeZone, onSelect, onClose }: {
  selected: CalendarDate; timeZone: string; onSelect: (date: CalendarDate) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState(selected);
  const [jump, setJump] = useState(formatDate(selected));
  const [error, setError] = useState("");
  const focusGrid = useRef(false);
  const [year, month] = parts(view);
  const first = calendarDate(year, month, 1);
  const currentToday = today(timeZone);
  const previous = addMonths(view, -1);
  const next = addMonths(view, 1);
  useLayoutEffect(() => {
    dialog.current!.showModal();
    dialog.current!.querySelector<HTMLElement>(`[data-date="${selected}"]`)?.focus();
  }, [selected]);
  useLayoutEffect(() => {
    if (focusGrid.current) dialog.current?.querySelector<HTMLElement>(`[data-date="${view}"]`)?.focus();
    focusGrid.current = false;
  }, [view]);
  function select(date: CalendarDate) {
    dialog.current?.close();
    onSelect(date);
  }
  function move(date: CalendarDate | null, focus = false) {
    if (date) { focusGrid.current = focus; setView(date); setJump(formatDate(date)); setError(""); }
  }
  function moveWithKeyboard(event: KeyboardEvent, date: CalendarDate) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday(date), End: 6 - weekday(date) };
    if (event.key in offsets) { event.preventDefault(); move(addDays(date, offsets[event.key]!), true); }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault(); move(addMonths(date, (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1)), true);
    }
  }
  function containTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input')];
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  const cells = Array.from({ length: weekday(first) }, (_, index) => <span role="gridcell" key={`empty-${index}`} />);
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const date = calendarDate(year, month, day);
    cells.push(<span role="gridcell" aria-selected={date === selected} key={date}>
      <button type="button" data-date={date} tabIndex={date === view ? 0 : -1} aria-label={formatDate(date)}
        aria-current={date === currentToday ? "date" : undefined} onKeyDown={(event) => moveWithKeyboard(event, date)} onClick={() => select(date)}>{day}</button>
    </span>);
  }
  while (cells.length % 7) cells.push(<span role="gridcell" key={`empty-${cells.length}`} />);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="calendar-title" aria-describedby="calendar-help" onClose={onClose} onKeyDown={containTab}>
    <div className={styles.heading}>
      <button type="button" aria-label="Previous month" disabled={!previous} onClick={() => move(previous)}>‹</button>
      <h2 id="calendar-title" aria-live="polite">{MONTHS[month - 1]} {String(year).padStart(4, "0")}</h2>
      <button type="button" aria-label="Next month" disabled={!next} onClick={() => move(next)}>›</button>
      <button type="button" aria-label="Close calendar" onClick={() => dialog.current?.close()}>×</button>
    </div>
    <form className={styles.jump} onSubmit={(event) => {
      event.preventDefault(); const date = parseDisplayDate(jump);
      if (date) select(date); else setError("Enter a real date as DD/MM/YYYY.");
    }}>
      <label htmlFor="calendar-jump">Jump to a date <span>(DD/MM/YYYY)</span></label>
      <div><input id="calendar-jump" type="text" placeholder="DD/MM/YYYY" value={jump} maxLength={10}
        aria-invalid={Boolean(error)} aria-describedby={error ? "calendar-input-error" : undefined}
        onChange={(event) => { setJump(event.target.value); setError(""); const date = parseDisplayDate(event.target.value); if (date) setView(date); }} /><button type="submit">Go</button></div>
      {error && <p id="calendar-input-error" role="alert">{error}</p>}
    </form>
    <div role="grid" aria-label={`${MONTHS[month - 1]} ${String(year).padStart(4, "0")}`}>
      <div role="row" className={styles.week}>
        {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => <span role="columnheader" aria-label={day} key={day}>{day.slice(0, 2)}</span>)}
      </div>
      {Array.from({ length: cells.length / 7 }, (_, row) => <div role="row" className={styles.week} key={row}>{cells.slice(row * 7, row * 7 + 7)}</div>)}
    </div>
    <div className={styles.bottom}><p id="calendar-help">Arrow keys move days. Page Up/Down moves months; add Shift for years. Escape closes.</p>
      <button type="button" onClick={() => select(today(timeZone))}>Today</button>
    </div>
  </dialog>;
}
