import { test as base, expect } from "@playwright/test";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
export const email = "owner@example.invalid";
export const password = "Synthetic-diary-password-42!";
export async function fixtureAdmin() {
  const port = process.env.DIARY_TEST_ADMIN_PORT; const ca = process.env.DIARY_TEST_CA;
  if (!port || !ca || !/^\d+$/.test(port) || !ca.startsWith("/tmp/diary-auth-test-")) throw new Error("Disposable auth fixture required; never use production credentials");
  return new Pool({ host: "127.0.0.1", port: Number(port), user: "diary_fixture_admin", database: "diary_auth_test", ssl: { ca: await readFile(ca, "utf8"), rejectUnauthorized: true } });
}
export async function resetLimits() { const pool = await fixtureAdmin(); try { await pool.query("TRUNCATE private.auth_rate_limit"); } finally { await pool.end(); } }
// Every existing regression test uses a real synthetic owner session. No auth bypass.
export const test = base.extend<{ authenticatedOwner: void }>({
  authenticatedOwner: [async ({ context }, provide) => {
    await resetLimits();
    const admin=await fixtureAdmin(); try { await admin.query("TRUNCATE diary.entries, diary.mutations, diary.preferences, diary.preference_mutations"); } finally { await admin.end(); }
    const response = await context.request.post("/api/auth/sign-in/email", { headers: { origin: "http://127.0.0.1:3100" }, data: { email, password } });
    expect(response.status()).toBe(200);
    await provide();
  }, { auto: true }],
});
export { expect };
