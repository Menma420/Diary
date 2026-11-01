"use client";
import { createContext, useContext } from "react";
import styles from "./AuthForm.module.css";
export const LogoutContext = createContext<(() => void) | null>(null);
export function LogoutControl() {
  const logout = useContext(LogoutContext);
  return logout ? <button className={styles.logout} onClick={logout}>Sign out</button> : null;
}
