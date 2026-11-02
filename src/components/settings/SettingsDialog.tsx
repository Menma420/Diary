"use client";
import { useRef,useState,useSyncExternalStore,useLayoutEffect,type FormEvent } from "react";
import { useDiarySession } from "../diary/DiarySession";
import { preferenceValuesSchema } from "@/lib/preferences/contracts";
import { ThemeSelector } from "./ThemeSelector";
import styles from "./Settings.module.css";
import auth from "../auth/AuthForm.module.css";
const labels={repair:'Stored theme needs repair',loading:'Loading settings…',unchanged:'Settings up to date',saving:'Saving settings…',unsaved:'Settings not saved',saved:'Settings saved',failed:'Settings save failed',conflict:'Settings conflict · review choices'};
export function SettingsDialog(){
 const {preferences,theme,setTheme,timeZone,active}=useDiarySession();
 const state=useSyncExternalStore(preferences?.subscribe??(()=>()=>{}),preferences?.snapshot??(()=>null),preferences?.snapshot??(()=>null));
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const saved=useRef<{node:HTMLTextAreaElement;start:number;end:number;direction:'forward'|'backward'|'none';y:number}|{control:true}|null>(null);
 const [timezone,setTimezone]=useState(timeZone),[error,setError]=useState('');
 useLayoutEffect(()=>{if(!active)dialog.current?.close();},[active]);
 function remember(){const node=document.activeElement;
  saved.current=node instanceof HTMLTextAreaElement&&node.id==='diary-writing'?{node,start:node.selectionStart,end:node.selectionEnd,direction:node.selectionDirection,y:window.scrollY}:null;
 }
 function open(){
  saved.current??={control:true};
  setTimezone(preferences?.snapshot().values.timezone??timeZone);setError('');dialog.current?.showModal();
 }
 function close(){dialog.current?.close();restore();}
 function restore(){const before=saved.current;saved.current=null;if(!active||!before)return;
  if('node' in before&&before.node.isConnected){before.node.focus({preventScroll:true});before.node.setSelectionRange(before.start,before.end,before.direction);window.scrollTo({top:before.y,behavior:'instant'});}else trigger.current?.focus({preventScroll:true});
 }
 function apply(event:FormEvent){event.preventDefault();const result=preferenceValuesSchema.safeParse({theme,timezone});if(!result.success){setError('Enter a valid IANA timezone, such as Asia/Kolkata.');return;}setError('');preferences?.choose(result.data);}
 return <>
  <button ref={trigger} type="button" className={styles.link} aria-haspopup="dialog" onPointerDown={remember} onPointerCancel={()=>{saved.current=null;}} onKeyDown={()=>{saved.current=null;}} onClick={open}>Settings</button>
  <span className={styles.status} role="status" aria-label="Preference save status">{state?labels[state.status]:''}</span>
  <dialog ref={dialog} className={`${auth.dialog} ${styles.dialog}`} aria-labelledby="settings-title" onClose={restore} onCancel={event=>{event.preventDefault();close();}}>
   <h2 id="settings-title">Appearance and timezone</h2>
   {state?.server?.repairRequired&&<p>Stored theme is unavailable. Previewing Sakura Pink. <button className={auth.action} onClick={()=>preferences?.choose(preferences.snapshot().values)}>Save Sakura Pink repair</button></p>}
   <ThemeSelector value={theme} onChange={setTheme}/>
   <form onSubmit={apply}><label htmlFor="diary-timezone">IANA timezone</label><input id="diary-timezone" value={timezone} onChange={event=>setTimezone(event.target.value)} aria-describedby="timezone-help" autoComplete="off"/>
    <p id="timezone-help">Used for Today. Your open date and existing entries stay unchanged.</p><p role="alert">{error}</p>
    <button className={auth.action} type="submit">Apply timezone</button>
   </form>
   <p role="status">{state?labels[state.status]:''}</p>
   {state?.status==='failed'&&<button className={auth.action} onClick={()=>void preferences?.retry()}>Retry settings save</button>}
   {state?.status==='conflict'&&<section aria-label="Preference conflict"><p>Another session changed settings. Your selection is preserved.</p><p>Server: {state.current?.theme} · {state.current?.timezone}</p><p>Your choice: {state.values.theme} · {state.values.timezone}</p>
    <button className={auth.action} onClick={()=>void preferences?.resolve('local')}>Keep my settings</button>{' '}
    <button className={auth.action} onClick={()=>void preferences?.resolve('server')}>Use server settings</button>
   </section>}
   <button className={auth.action} onClick={close}>Close settings</button>
  </dialog>
 </>;
}
