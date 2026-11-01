"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { PublicAccess } from "@/lib/auth/owner";
import type { SaveController } from "@/lib/diary/save-controller";
import type { CalendarDate } from "@/lib/dates";
import { DiarySession } from "@/components/diary/DiarySession";
import { DiaryPreview } from "@/components/diary/DiaryPreview";
import { AuthForm, authPost } from "./AuthForm";
import styles from "./AuthForm.module.css";
import { LogoutContext } from "./SessionControls";

const accessSchema = z.union([
  z.object({ kind: z.literal("owner"), workspaceId: z.string().regex(/^w1_[A-Za-z0-9_-]{43}$/), expiresAt: z.iso.datetime(), checkedAt: z.iso.datetime() }),
  z.object({ kind: z.enum(["anonymous", "forbidden", "unavailable"]) }),
]);
const RouteContext = createContext<((date: CalendarDate, access: PublicAccess) => void) | null>(null);
export function DiaryRoute({ date, access }: { date: CalendarDate; access: PublicAccess }) {
  const activate = useContext(RouteContext);
  useLayoutEffect(() => { activate?.(date, access); }, [activate, date, access]);
  return null;
}
export function DiaryAccess({ initial, timeZone, children }: { initial: PublicAccess; timeZone: string; children: ReactNode }) {
  const router = useRouter();
  const persistence = useRef<SaveController | null>(null);
  const [workspaceId, setWorkspaceId] = useState(initial.kind === "owner" ? initial.workspaceId : null);
  const [access, setAccess] = useState<PublicAccess>(initial);
  const [date, setDate] = useState<CalendarDate | null>(null);
  const routeVersion=useRef(0);
  const pendingDate = useRef<CalendarDate | null>(null);
  const version = useRef(0); const focus = useRef<{ node: HTMLTextAreaElement; start: number; end: number; direction: "forward" | "backward" | "none"; y: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const lock = useRef<HTMLDivElement>(null);
  const [logoutError, setLogoutError] = useState(""); const [loggingOut, setLoggingOut] = useState(false);
  const permitted = access.kind === "owner" && access.workspaceId === workspaceId;
  const remember = useCallback(() => {
    const node = document.activeElement;
    if (node instanceof HTMLTextAreaElement && node.id === "diary-writing") focus.current = { node, start: node.selectionStart, end: node.selectionEnd, direction: node.selectionDirection, y: window.scrollY };
  }, []);
  const accept = useCallback((next: PublicAccess) => {
    if (next.kind !== "owner" || (workspaceId && next.workspaceId !== workspaceId)) remember();
    if (next.kind === "owner" && workspaceId && next.workspaceId !== workspaceId) { setAccess({ kind: "forbidden" }); return; }
    setAccess(next);
    if (next.kind === "owner") { setWorkspaceId(next.workspaceId); if (pendingDate.current) setDate(pendingDate.current); }
  }, [workspaceId, remember]);
  const activate = useCallback((nextDate: CalendarDate, next: PublicAccess) => {
    pendingDate.current = nextDate;
    // A cached RSC/prefetch result must never unlock a previously locked workspace.
    // Only the fresh no-store session check after reauthentication may do that.
    if (next.kind === "owner" && workspaceId) {
      if (next.workspaceId === workspaceId) {
        const navigation=++routeVersion.current;
        // Guard incoming routes too, including browser history. The mounted
        // outgoing editor stays present until its recovery transaction settles.
        void (async () => {
          await persistence.current?.flushLocal();
          if (navigation===routeVersion.current) setDate(nextDate);
        })();
      }
      else accept({ kind: "forbidden" });
    } else accept(next);
  }, [accept, workspaceId]);
  const check = useCallback(async () => {
    const generation = ++version.current;
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const result = accessSchema.parse(await response.json());
      if (generation === version.current) accept(result);
      return result;
    } catch { if (generation === version.current) accept({ kind: "unavailable" }); return { kind: "unavailable" } as const; }
  }, [accept]);
  useEffect(() => {
    if (!workspaceId) return;
    const onFocus = () => { void check(); };
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) void check(); };
    window.addEventListener("focus", onFocus); window.addEventListener("pageshow", onShow);
    // Relative server lifetime, scheduled once; independent of device date/clock
    // changes. RSC navigation cannot refresh this timer. Focus checks are live.
    const timeout = access.kind === "owner" ? window.setTimeout(() => { version.current++; remember(); setAccess({ kind: "anonymous" }); }, Math.max(0, new Date(access.expiresAt).getTime() - new Date(access.checkedAt).getTime())) : undefined;
    return () => { window.removeEventListener("focus", onFocus); window.removeEventListener("pageshow", onShow); window.clearTimeout(timeout); };
  }, [workspaceId, access, check, remember]);
  useLayoutEffect(() => {
    if (!permitted && workspaceId) lock.current?.focus({ preventScroll: true });
    if (permitted && focus.current) {
      const saved = focus.current; focus.current = null;
      if (saved.node.isConnected) { saved.node.focus({ preventScroll: true }); saved.node.setSelectionRange(saved.start, saved.end, saved.direction); window.scrollTo({ top: saved.y, behavior: "instant" }); }
    }
  }, [permitted, workspaceId]);
  async function reauthenticated() {
    const result = await check();
    if (result.kind !== "owner" || (workspaceId && result.workspaceId !== workspaceId)) throw new Error("This identity cannot unlock the existing workspace.");
    router.refresh();
  }
  const lockOwner=useCallback(() => { remember(); setAccess({ kind: "anonymous" }); },[remember]);
  async function logout() {
    setLoggingOut(true); setLogoutError("");
    try {
      if (persistence.current && !await persistence.current.flush()) { setLogoutError("Writing is unresolved. Sign out was paused; your drafts remain available. Keep writing and retry saving or resolve the conflict first."); return; }
      await authPost("sign-out", {}); version.current++; routeVersion.current++; dialog.current?.close(); setDate(null); setWorkspaceId(null); setAccess({ kind: "anonymous" }); focus.current = null; router.replace("/login"); router.refresh(); }
    catch { setLogoutError("Sign out could not be confirmed. Your writing remains in this tab. Retry when the connection is available."); }
    finally { setLoggingOut(false); }
  }
  return <RouteContext.Provider value={activate}>
    {children}
    {workspaceId && <DiarySession key={workspaceId} timeZone={timeZone} workspaceId={workspaceId} active={permitted} onLock={lockOwner} controllerRef={persistence}>
      <LogoutContext.Provider value={() => { setLogoutError(""); dialog.current?.showModal(); }}>
        <div inert={!permitted} aria-hidden={!permitted} style={!permitted ? { visibility: "hidden" } : undefined}>
          {date && <DiaryPreview key={date} date={date} mode={permitted ? "editable" : "read-only"} />}
        </div>
      </LogoutContext.Provider>
    </DiarySession>}
    {!permitted && <main className={workspaceId ? styles.overlay : styles.page} ref={lock} tabIndex={-1}>
      <AuthForm locked={Boolean(workspaceId)} onSuccess={reauthenticated} />
    </main>}
    <dialog className={styles.dialog} ref={dialog} aria-labelledby="logout-title">
      <h2 id="logout-title">Leave this writing session?</h2>
      <p>We will try to save unresolved writing before signing out. If saving fails, this session stays open and your drafts are preserved. You can cancel and keep writing.</p>
      <p role="alert">{logoutError}</p>
      <button className={styles.action} onClick={() => dialog.current?.close()} disabled={loggingOut} autoFocus>Keep writing</button>{" "}
      <button className={styles.action} onClick={() => void logout()} disabled={loggingOut}>Save and sign out</button>
    </dialog>
  </RouteContext.Provider>;
}
