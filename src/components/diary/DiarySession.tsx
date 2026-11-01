"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CalendarDate } from "@/lib/dates";
import { DEFAULT_THEME, type ThemeId } from "@/themes/themes";
import { EditorWorkspace } from "@/lib/diary/editor-workspace";

type NavigationFocus = { date: CalendarDate; source: HTMLElement; control: HTMLElement; calendar: boolean };
type Session = {
  timeZone: string;
  workspace: EditorWorkspace;
  focusRef: RefObject<NavigationFocus | null>;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};
const Context = createContext<Session | null>(null);

// One mounted diary layout/tab. No authentication, durable storage or save engine.
export function DiarySession({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  const [workspace] = useState(() => new EditorWorkspace());
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
  return <Context.Provider value={{ timeZone, workspace, focusRef, theme, setTheme }}>{children}</Context.Provider>;
}
export function useDiarySession() {
  const session = useContext(Context);
  if (!session) throw new Error("Diary session is required");
  return session;
}
