"use client";
import { useRef, useSyncExternalStore } from "react";
import { formatDate, type CalendarDate } from "@/lib/dates";
import type { SaveController } from "@/lib/diary/save-controller";
import { useDiarySession } from "./DiarySession";
import styles from "./DiaryPreview.module.css";
import authStyles from "../auth/AuthForm.module.css";
const subscribe=() => () => {};
export function SaveFeedback({ date }: { date: CalendarDate }) {
  const { persistence }=useDiarySession();
  const state=useSyncExternalStore(persistence?.subscribe ?? subscribe,()=>persistence?.snapshot(date) ?? null,()=>null);
  const label=!state ? "Preview · not saved" : ({ loading: "Loading diary…", "load-failed": "Could not load diary", unchanged: "Up to date", unsaved: "Unsaved changes", saving: "Saving to server…", saved: "Saved", "save-failed": "Save failed", conflict: "Conflict · review writing" })[state.phase];
  return <section className={styles.previewNotice} aria-label="Save and recovery status">
    <p id="preview-notice" role="status" aria-live="polite">{label}</p>
    {state?.durable && state.recovery === "available" && <p>Draft stored on this device</p>}
    {state?.recovery === "unavailable" && <p role="status">Recovery unavailable · keep this tab open</p>}
    {state && ["save-failed","load-failed"].includes(state.phase) && <button className={authStyles.action} onClick={()=>persistence?.retry(date)}>Retry</button>}
  </section>;
}
function ConflictDialog({ date, controller }: { date: CalendarDate; controller: SaveController }) {
  const state=useSyncExternalStore(controller.subscribe,()=>controller.snapshot(date),()=>controller.snapshot(date));
  const dialog=useRef<HTMLDialogElement>(null);
  if (state.phase !== "conflict") return null;
  return <>
    <button className={authStyles.action} onClick={()=>dialog.current?.showModal()}>Review conflict for {formatDate(date)}</button>
    <dialog className={`${authStyles.dialog} ${styles.conflict}`} ref={dialog} aria-label={`Resolve writing for ${formatDate(date)}`}>
      <h2>Two versions of {formatDate(date)}</h2>
      <p>Both versions are preserved. Choose deliberately; we will check the server version again before saving.</p>
      <h3>Current server writing{state.current?.exists ? "" : " (untouched date)"}</h3>
      <pre>{state.current?.content || "(Empty)"}</pre>
      <button className={authStyles.action} onClick={()=>void controller.resolve(date,"server")}>Keep server version and discard listed local drafts</button>
      {state.alternatives.map((record,index)=><section key={`${record.key.writerId}-${index}`}>
        <h3>Local writing {index+1}</h3><pre>{record.content || "(Empty)"}</pre>
        <button className={authStyles.action} onClick={()=>void controller.resolve(date,record)}>Keep local writing {index+1} and replace server version</button>
      </section>)}
      <button className={authStyles.action} onClick={()=>dialog.current?.close()}>Decide later</button>
    </dialog>
  </>;
}
export function RecoveryNotice({ currentDate }: { currentDate: CalendarDate }) {
  const { persistence }=useDiarySession();
  useSyncExternalStore(persistence?.subscribe ?? subscribe,persistence?.getVersion ?? (()=>0),()=>0);
  if (!persistence) return null;
  return <div className={styles.recoveryNotice}>{persistence.dates().filter(date=>persistence.snapshot(date).phase === "conflict").map(date=><ConflictDialog key={date} date={date} controller={persistence} />)}
    {persistence.dates().filter(date=>date!==currentDate && ["save-failed","load-failed"].includes(persistence.snapshot(date).phase)).map(date=><p key={date}>Writing needs attention for {formatDate(date)}. <button className={authStyles.action} onClick={()=>persistence.retry(date)}>Retry {formatDate(date)}</button></p>)}
  </div>;
}
