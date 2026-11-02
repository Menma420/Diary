"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useSyncExternalStore, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CalendarDate } from "@/lib/dates";
import { defaultSnapshot,type PreferenceRead } from "@/lib/preferences/contracts";
import { PreferenceController } from "@/lib/preferences/controller";
import { HttpPreferences } from "@/lib/preferences/http";
import { DEFAULT_THEME, type ThemeId } from "@/themes/themes";
import { SaveController } from "@/lib/diary/save-controller";
import { IndexedRecovery } from "@/lib/diary/recovery-store";
import { HttpEntries } from "@/lib/diary/http-persistence";
import { EditorWorkspace } from "@/lib/diary/editor-workspace";

type NavigationFocus = { date: CalendarDate; source: HTMLElement; control: HTMLElement; calendar: boolean };
type Session = {
  timeZone: string;
  active: boolean;
  workspace: EditorWorkspace;
  persistence: SaveController | null;
  preferences: PreferenceController | null;
  focusRef: RefObject<NavigationFocus | null>;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};
const Context = createContext<Session | null>(null);

// One mounted owner workspace. Editor state stays independent of the I/O adapters.
export function DiarySession({ timeZone, children, workspaceId, active = true, onLock, controllerRef, initialPreferences }: { timeZone: string; children: ReactNode; workspaceId?: string; active?: boolean; onLock?: () => void; controllerRef?: RefObject<SaveController | null>; initialPreferences?:PreferenceRead }) {
  const [workspace] = useState(() => new EditorWorkspace());
  const [persistence] = useState(() => workspaceId ? new SaveController(workspace, workspaceId, crypto.randomUUID(), new HttpEntries(), new IndexedRecovery(), onLock) : null);
  useEffect(() => {
    if (controllerRef) controllerRef.current=persistence;
    if (persistence) void persistence.start();
    return () => { persistence?.stop(); if (controllerRef) controllerRef.current=null; };
  }, [persistence, controllerRef]);
  useEffect(() => {
    if (!persistence) return;
    if (!active) persistence.setPaused(true);
    let mounted=true;
    if (active) void persistence.start().then(() => { if (mounted) return persistence.resume(); });
    return () => { mounted=false; };
  }, [persistence, active]);
  const focusRef = useRef<NavigationFocus | null>(null);
  const [preferences]=useState(()=>workspaceId?new PreferenceController(initialPreferences??{kind:'loaded',preferences:defaultSnapshot()},new HttpPreferences(),onLock):null);
  const preferenceState=useSyncExternalStore(preferences?.subscribe??(()=>()=>{}),preferences?.snapshot??(()=>null),preferences?.snapshot??(()=>null));
  const [previewTheme,setPreviewTheme]=useState<ThemeId>(DEFAULT_THEME);
  const theme=preferenceState?.values.theme??previewTheme;
  const setTheme=(theme:ThemeId)=>{if(preferences)preferences.choose({...preferences.snapshot().values,theme});else setPreviewTheme(theme);};
  useLayoutEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
  useEffect(()=>{
    if(!preferences)return;
    preferences.setPaused(!active);
    if(active)void preferences.resume();
    const focus=()=>{if(active)void preferences.revalidate();};
    const show=(event:PageTransitionEvent)=>{if(event.persisted)focus();};
    window.addEventListener('focus',focus);window.addEventListener('pageshow',show);
    return()=>{preferences.setPaused(true);window.removeEventListener('focus',focus);window.removeEventListener('pageshow',show);};
  },[preferences,active]);
  useEffect(() => {
    function cancelSupersededFocus(event: FocusEvent) {
      const intent = focusRef.current;
      if (intent && event.target !== intent.source && event.target !== intent.control && event.target !== document.body) focusRef.current = null;
    }
    document.addEventListener("focusin", cancelSupersededFocus);
    return () => {
      document.removeEventListener("focusin", cancelSupersededFocus);
      document.documentElement.dataset.theme = DEFAULT_THEME;
    };
  }, []);
  return <Context.Provider value={{ active, timeZone:preferenceState?.values.timezone??timeZone, workspace, persistence, preferences, focusRef, theme, setTheme }}>{preferenceState&&!preferenceState.server?<section aria-label="Appearance unavailable"><p role="status">Could not load appearance settings.</p><button onClick={()=>void preferences?.retry()}>Retry appearance</button></section>:children}</Context.Provider>;
}
export function useDiarySession() {
  const session = useContext(Context);
  if (!session) throw new Error("Diary session is required");
  return session;
}
