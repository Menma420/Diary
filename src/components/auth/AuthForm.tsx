"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./AuthForm.module.css";

export async function authPost(operation: string, body: object) {
  const response = await fetch(`/api/auth/${operation}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  if (!response.ok) {
    const result: unknown = await response.json();
    throw new Error(typeof result === "object" && result && "error" in result && typeof result.error === "string" ? result.error : "Authentication is unavailable.");
  }
}
export function AuthForm({ mode = "login", onSuccess, locked = false }: { mode?: "login" | "recover" | "reset" | "verify"; onSuccess?: () => Promise<void>; locked?: boolean }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState(""); const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [failed, setFailed] = useState(false);
  const token = useRef(""); const [verification, setVerification] = useState(false);
  useEffect(() => {
    if (mode !== "reset" && mode !== "verify") return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.has("token")) token.current = params.get("token") ?? "";
    // Tokens stay in component memory, never URLs in requests, markup or logs.
    window.history.replaceState(null, "", window.location.pathname);
  }, [mode]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
    try {
      if (mode === "reset" && password !== confirm) throw new Error("Passwords must match.");
      if ((mode === "reset" || mode === "verify") && !token.current) throw new Error("This link is missing or expired. Request a new email.");
      await authPost(mode === "login" ? "sign-in/email" : mode === "recover" ? verification ? "send-verification-email" : "request-password-reset" : mode === "reset" ? "reset-password" : "verify-email",
        mode === "login" ? { email, password } : mode === "recover" ? { email } : mode === "reset" ? { token: token.current, newPassword: password } : { token: token.current });
      setPassword(""); setConfirm("");
      if (mode === "login") { await onSuccess?.(); }
      else { setMessage(mode === "recover" ? "If this is the owner's account, an email will arrive when delivery is configured." : "Complete. You can now sign in."); if (mode !== "recover") token.current = ""; }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Authentication is unavailable."); }
    finally { setBusy(false); }
  }
  const title = mode === "login" ? locked ? "Sign in to continue writing" : "Your little diary" : mode === "recover" ? "Account recovery" : mode === "reset" ? "Choose a new password" : "Verify your email";
  return <section className={styles.card} aria-labelledby="auth-title">
    <h1 id="auth-title">{title}</h1>
    {locked && <p>Your writing is still in this tab. Sign in as the same owner to continue. Reloading will lose it.</p>}
    <form className={styles.form} onSubmit={submit} aria-busy={busy}>
      {(mode === "login" || mode === "recover") && <label>Email<input type="email" name="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {(mode === "login" || mode === "reset") && <>
        <div className={styles.password}><label>Password<input name="password" type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "reset" ? 12 : 1} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label><button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button></div>
        {mode === "reset" && <label>Confirm password<input name="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>}
      </>}
      {mode === "recover" && <label><span><input type="checkbox" checked={verification} onChange={e => setVerification(e.target.checked)} /> Send an email verification link instead</span></label>}
      <p className={styles.notice} role={failed ? "alert" : "status"} aria-live="polite">{message}</p>
      <button disabled={busy} type="submit">{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "recover" ? "Send recovery email" : mode === "reset" ? "Reset password" : "Verify email"}</button>
    </form>
    {mode === "login" ? <a className={styles.link} href="/recover" target={locked ? "_blank" : undefined} rel={locked ? "noopener noreferrer" : undefined}>Forgot password?{locked ? " (opens a new tab)" : ""}</a> : <a className={styles.link} href="/login">Back to sign in</a>}
  </section>;
}
