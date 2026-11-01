import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// Synthetic sentinels are set during the verification build, never real credentials.
export const sentinels = [
  "11111111-1111-4111-8111-111111111111",
  "phase1-browser-leak-sentinel",
  "https://phase1-private-config.example.invalid",
];

// Check locally injected database credentials without ever printing them.
for (const path of [".env.local", ".env"]) if (existsSync(path)) process.loadEnvFile(path);
const privateValues = [...sentinels];
for (const key of ["BETTER_AUTH_SECRET", "AUTH_DERIVATION_SECRET", "BREVO_API_KEY"]) {
  if (process.env[key]) privateValues.push(process.env[key]);
}
for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "AUTH_DATABASE_URL"]) {
  const value = process.env[key];
  if (!value) continue;
  privateValues.push(value);
  try {
    const password = new URL(value).password;
    if (password.length >= 12) privateValues.push(password, decodeURIComponent(password));
  } catch { throw new Error(`Invalid ${key}; value redacted`); }
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesIn(path) : [path];
  }));
  return nested.flat();
}

const files = [
  ...await filesIn(".next/static"),
  ...((await filesIn(".next/server/app")).filter((file) => /\.(html|rsc)$/.test(file))),
];
for (const file of files) {
  const text = await readFile(file, "utf8");
  if (privateValues.some((value) => text.includes(value))) {
    throw new Error(`Server configuration sentinel leaked into browser output: ${file}`);
  }
}
console.log(`Client output check passed (${files.length} assets/payloads; synthetic sentinels and configured server credentials).`);
