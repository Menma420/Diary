import { spawn } from "node:child_process";
import { startFixture } from "./fixture.mjs";
const fixture = await startFixture();
console.log("Disposable PostgreSQL TLS fixture, reviewed migrations, restricted runtime role and synthetic mail sink ready.");
try {
  const child = spawn("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, ...fixture.env } });
  process.exitCode = await new Promise(resolve => child.on("exit", code => resolve(code ?? 1)));
} finally { await fixture.close(); }
