import { AuthForm } from "@/components/auth/AuthForm";
import styles from "@/components/auth/AuthForm.module.css";
export const dynamic = "force-dynamic";
export default function Page() { return <main className={styles.page}><AuthForm mode="recover" /></main>; }
