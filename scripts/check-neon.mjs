import { existsSync } from "node:fs";

for (const path of [".env.local", ".env"]) if (existsSync(path)) process.loadEnvFile(path);
const origin = process.env.PREVIEW_URL ?? "http://127.0.0.1:3100";
const response = await fetch(new URL("/api/health/postgres", origin), { signal: AbortSignal.timeout(15_000) });
const body = await response.json();
if (response.status !== 200 || body.status !== "ok" || body.services?.postgres !== "connected" || !response.headers.get("cache-control")?.includes("no-store")) {
  throw new Error(`Neon PostgreSQL end-to-end check failed (HTTP ${response.status})`);
}
console.log(`GET /api/health/postgres: HTTP ${response.status}`);
console.log(JSON.stringify(body));
console.log("PASS: running Next.js route executed the read-only PostgreSQL SELECT 1 check.");
const diary = await fetch(new URL("/diary/31/10/2026", origin));
const html = await diary.text();
if (diary.status !== 200 || !html.includes("Preview")) throw new Error("Diary page smoke check failed");
for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
  const value = process.env[key];
  if (!value) continue;
  const password = new URL(value).password;
  const privateValues = [value, ...(password.length >= 12 ? [password, decodeURIComponent(password)] : [])];
  if (privateValues.some((secret) => html.includes(secret))) throw new Error("Database credentials leaked into diary HTML; values redacted");
}
console.log("PASS: diary HTTP 200; configured database credentials absent from rendered HTML.");
