"use client";
import { useRouter } from "next/navigation";
import { AuthForm } from "./AuthForm";
import styles from "./AuthForm.module.css";
export function LoginPage() {
  const router = useRouter();
  return <main className={styles.page}><AuthForm onSuccess={async () => {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (!response.ok) throw new Error("Verified owner access is unavailable. Contact the operator.");
    router.replace("/diary"); router.refresh();
  }} /></main>;
}
