"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CalendarDate } from "@/lib/dates";
import { DEFAULT_THEME, type ThemeId } from "@/themes/themes";
import { SaveController } from "@/lib/diary/save-controller";
import { IndexedRecovery } from "@/lib/diary/recovery-store";
import { HttpEntries } from "@/lib/diary/http-persistence";
import { EditorWorkspace } from "@/lib/diary/editor-workspace";

type NavigationFocus = { date: CalendarDate; source: HTMLElement; control: HTMLElement; calendar: boolean };
type Session = {
  timeZone: string;
  workspace: EditorWorkspace;
  persistence: SaveController | null;
  focusRef: RefObject<NavigationFocus | null>;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};
const Context = createContext<Session | null>(null);

// One mounted owner workspace. Editor state stays independent of the I/O adapters.
export function DiarySession({ timeZone, children, workspaceId, active = true, onLock, controllerRef }: { timeZone: string; children: ReactNode; workspaceId?: string; active?: boolean; onLock?: () => void; controllerRef?: RefObject<SaveController | null> }) {
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
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
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
  return <Context.Provider value={{ timeZone, workspace, persistence, focusRef, theme, setTheme }}>{children}</Context.Provider>;
}
export function useDiarySession() {
  const session = useContext(Context);
  if (!session) throw new Error("Diary session is required");
  return session;
}
