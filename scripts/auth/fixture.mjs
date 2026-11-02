import { mkdtemp, readFile, writeFile, chmod, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";
import { createDiaryAuth } from "../../src/lib/auth/config.ts";
import { postgresPoolOptions } from "../../src/lib/postgres-config.ts";

const execFile = promisify(execFileCallback);
export const fixtureOwner = "12345678-1234-4234-8234-123456789abc";
export const fixtureEmail = "owner@example.invalid";
export const fixturePassword = "Synthetic-diary-password-42!";
async function postgresBin() {
  if (process.env.DIARY_TEST_PG_BIN && existsSync(join(process.env.DIARY_TEST_PG_BIN, "initdb"))) return process.env.DIARY_TEST_PG_BIN;
  if (existsSync("/usr/lib/postgresql")) for (const version of (await readdir("/usr/lib/postgresql")).sort().reverse()) {
    const bin = `/usr/lib/postgresql/${version}/bin`; if (existsSync(`${bin}/initdb`)) return bin;
  }
  throw new Error("Disposable PostgreSQL binaries unavailable. Set DIARY_TEST_PG_BIN. No production URL is used.");
}
async function listen(server) { await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject)); return server.address().port; }
export async function startFixture() {
  const directory = await mkdtemp(join(tmpdir(), "diary-auth-test-"));
  const bin = await postgresBin();
  const commands = async (name, args) => execFile(join(bin, name), args, { maxBuffer: 1024 * 1024 });
  const portServer = createServer(); const port = await listen(portServer); await new Promise(r => portServer.close(r));
  const derivationSecret = randomBytes(32).toString("base64url");
  const secret = randomBytes(48).toString("base64url"); const dbPassword = randomBytes(32).toString("hex"); const control = randomBytes(32).toString("hex");
  const messages = [];
  const sink = createServer(async (req, res) => {
    if (req.url === "/messages" && req.method === "POST") {
      let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 16384) { res.writeHead(413).end(); return; } }
      try { messages.push(JSON.parse(raw)); res.writeHead(200).end("{}"); } catch { res.writeHead(400).end(); }
    } else if (req.url === "/messages" && req.headers.authorization === `Bearer ${control}`) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(messages));
    } else res.writeHead(404).end();
  });
  let admin; let runtime; let diary; let started = false;
  try {
    await commands("initdb", ["-D", `${directory}/data`, "-U", "diary_fixture_admin", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
    await execFile("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${directory}/server.key`, "-out", `${directory}/server.crt`, "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"]);
    await chmod(`${directory}/server.key`, 0o600);
    await writeFile(`${directory}/data/pg_hba.conf`, "local all all trust\nhostssl all diary_fixture_admin 127.0.0.1/32 trust\nhostssl all all 127.0.0.1/32 scram-sha-256\nhost all all 127.0.0.1/32 reject\n");
    await commands("pg_ctl", ["-D", `${directory}/data`, "-l", `${directory}/postgres.log`, "-o", `-h 127.0.0.1 -p ${port} -k ${directory} -c ssl=on -c ssl_cert_file=${directory}/server.crt -c ssl_key_file=${directory}/server.key`, "start"]);
    started = true;
    const adminOptions = { host: "127.0.0.1", port, user: "diary_fixture_admin", ssl: { ca: await readFile(`${directory}/server.crt`, "utf8"), rejectUnauthorized: true } };
    const initial = new Pool({ ...adminOptions, database: "postgres" });
    await initial.query("CREATE DATABASE diary_auth_test"); await initial.end();
    admin = new Pool({ ...adminOptions, database: "diary_auth_test" });
    const generated = await getMigrations(createDiaryAuth({ pool: admin, origin: "http://127.0.0.1:3100", secret, secure: true, mail: async () => {}, consume: async () => ({ allowed: true, retryAfter: null }) }).options);
    const sql = await generated.compileMigrations();
    if (sql !== await readFile("migrations/auth/001_better_auth_1_7_15.sql", "utf8")) throw new Error("Pinned Better Auth schema differs from reviewed migration");
    await admin.query(sql);
    await admin.query(await readFile("migrations/auth/002_owner_and_limits.sql", "utf8"));
    await admin.query(await readFile("migrations/diary/001_entries.sql", "utf8"));
    await admin.query(await readFile("migrations/diary/002_preferences.sql", "utf8"));
    await admin.query(`CREATE ROLE diary_entry_fixture LOGIN PASSWORD '${dbPassword}' IN ROLE diary_entry_runtime`);
    await admin.query("GRANT CONNECT ON DATABASE diary_auth_test TO diary_entry_runtime");
    // Random fixture-only login credentials; never emitted or written into the repo.
    await admin.query(`CREATE ROLE diary_auth_fixture LOGIN PASSWORD '${dbPassword}' IN ROLE diary_auth_runtime`);
    await admin.query("REVOKE CONNECT, TEMPORARY ON DATABASE diary_auth_test FROM PUBLIC; GRANT CONNECT ON DATABASE diary_auth_test TO diary_auth_runtime");
    const password = await hashPassword(fixturePassword);
    for (const [id, email, verified] of [["fixture-owner", fixtureEmail, true], ["fixture-other", "other@example.invalid", true]]) {
      await admin.query('INSERT INTO auth_user (id,name,email,"emailVerified") VALUES ($1,$1,$2,$3)', [id, email, verified]);
      await admin.query('INSERT INTO auth_account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$1,\'credential\',$1,$2,now())', [id, password]);
    }
    await admin.query("INSERT INTO private.diary_owner (owner_id,auth_user_id) VALUES ($1,'fixture-owner')", [fixtureOwner]);
    const url = new URL(`postgresql://diary_auth_fixture:${dbPassword}@127.0.0.1:${port}/diary_auth_test`);
    url.searchParams.set("sslmode", "verify-full"); url.searchParams.set("sslrootcert", `${directory}/server.crt`);
    runtime = new Pool(postgresPoolOptions(url.href));
    const diaryURL=new URL(url.href); diaryURL.username="diary_entry_fixture";
    diary = new Pool(postgresPoolOptions(diaryURL.href));
    const sinkPort = await listen(sink);
    const sinkURL = `http://127.0.0.1:${sinkPort}`;
    const env = { DIARY_DATABASE_URL: diaryURL.href, APP_ORIGIN: "http://127.0.0.1:3100", DEFAULT_TIMEZONE: "Asia/Kolkata", AUTH_DATABASE_URL: url.href, DATABASE_URL: url.href,
      BETTER_AUTH_SECRET: secret, AUTH_DERIVATION_SECRET: derivationSecret, AUTH_MAIL_MODE: "sink", AUTH_MAIL_SINK_URL: sinkURL,
      DIARY_TEST_ADMIN_PORT: String(port), DIARY_TEST_CA: `${directory}/server.crt`, DIARY_TEST_CONTROL: control };
    const close = async () => { await diary.end(); await runtime.end(); await admin.end(); await new Promise(r => sink.close(r)); await commands("pg_ctl", ["-D", `${directory}/data`, "-m", "immediate", "stop"]); await rm(directory, { recursive: true, force: true }); };
    return { admin, runtime, diary, env, messages, close, secret, derivationSecret };
  } catch {
    await diary?.end(); await runtime?.end(); await admin?.end(); sink.close();
    if (started) await commands("pg_ctl", ["-D", `${directory}/data`, "-m", "immediate", "stop"]);
    await rm(directory, { recursive: true, force: true });
    throw new Error("Disposable authentication fixture setup failed; details withheld to protect credentials.");
  }
}
