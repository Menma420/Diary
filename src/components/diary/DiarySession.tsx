"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CalendarDate } from "@/lib/dates";
import { DEFAULT_THEME, type ThemeId } from "@/themes/themes";

export type MemoryDraft = { text: string; start: number; end: number; direction: "forward" | "backward" | "none"; scrollY: number };
type NavigationFocus = { date: CalendarDate; source: HTMLElement; control: HTMLElement; calendar: boolean };
type Session = {
  timeZone: string;
  drafts: Map<CalendarDate, MemoryDraft>;
  focusRef: RefObject<NavigationFocus | null>;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};
const Context = createContext<Session | null>(null);

// One mounted diary layout/tab. No storage, ownership/auth contract, revisions or save engine.
export function DiarySession({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  const [drafts] = useState(() => new Map<CalendarDate, MemoryDraft>());
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
  return <Context.Provider value={{ timeZone, drafts, focusRef, theme, setTheme }}>{children}</Context.Provider>;
}
export function useDiarySession() {
  const session = useContext(Context);
  if (!session) throw new Error("Diary session is required");
  return session;
}
