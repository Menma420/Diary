import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { getMigrations } from "better-auth/db/migration";
import { createDiaryAuth } from "../../src/lib/auth/config.ts";
import { authRateLimiter } from "../../src/lib/auth/rate-limit.ts";
import { startFixture, fixtureOwner } from "../../scripts/auth/fixture.mjs";
import { derivationKey, opaqueWorkspaceId, limitIdentity } from "../../src/lib/auth/derivations.server.ts";
import { normalizeIP, normalizeEmail } from "../../src/lib/auth/identifiers.server.ts";
import { assertAuthRuntime } from "../../src/lib/auth/runtime-role.server.ts";
import { hkdfSync, createHmac } from "node:crypto";
let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });
test("reviewed migration matches pinned library and leaves no schema diff", async () => {
  const auth = createDiaryAuth({ pool: fixture.admin, origin: fixture.env.APP_ORIGIN, secret: fixture.secret, secure: true, mail: async () => {}, consume: authRateLimiter(fixture.runtime, fixture.derivationSecret) });
  const result = await getMigrations(auth.options);
  assert.equal(result.toBeCreated.length, 0); assert.equal(result.toBeAdded.length, 0);
  const tables = await fixture.admin.query("SELECT tablename FROM pg_tables WHERE schemaname IN ('public','private')");
  assert.deepEqual(tables.rows.map(r => r.tablename).sort(), ["auth_account", "auth_rate_limit", "auth_session", "auth_user", "auth_verification", "diary_owner"]);
});
test("owner binding is singleton, unique and references an existing identity", async () => {
  await assert.rejects(fixture.admin.query("INSERT INTO private.diary_owner (owner_id,auth_user_id) VALUES (gen_random_uuid(),'fixture-other')"), { code: "23505" });
  await assert.rejects(fixture.admin.query("UPDATE private.diary_owner SET auth_user_id='missing'"), { code: "23503" });
  assert.equal((await fixture.admin.query("SELECT owner_id FROM private.diary_owner")).rows[0].owner_id, fixtureOwner);
});
test("runtime cannot create users, modify identity or rebind owner", async () => {
  for (const sql of ["DELETE FROM private.diary_owner", "UPDATE private.diary_owner SET owner_id=gen_random_uuid()", "INSERT INTO private.diary_owner (owner_id,auth_user_id) VALUES (gen_random_uuid(),'fixture-other')", "TRUNCATE private.diary_owner", "UPDATE auth_user SET email='changed@example.invalid'", "INSERT INTO auth_user (id,name,email,\"emailVerified\") VALUES ('new','new','new@example.invalid',true)", "CREATE TABLE public.unsafe(id int)"]) {
    await assert.rejects(fixture.runtime.query(sql), { code: "42501" });
  }
});
test("durable rate limiting atomically grants exactly five concurrent slots", async () => {
  const consume = authRateLimiter(fixture.runtime, fixture.derivationSecret);
  const results = await Promise.all(Array.from({ length: 20 }, () => consume("synthetic-concurrent", { window: 60, max: 5 })));
  assert.equal(results.filter(r => r.allowed).length, 5);
  const rows = await fixture.admin.query("SELECT key FROM private.auth_rate_limit");
  assert.ok(rows.rows.every(r => /^[a-f0-9]{64}$/.test(r.key)));
  await fixture.admin.query("UPDATE private.auth_rate_limit SET started_at=now()-interval '2 minutes'");
  assert.equal((await consume("synthetic-concurrent", { window: 60, max: 5 })).allowed, true);
});
test("rate limit database failure rejects instead of granting a request", async () => {
  const client = await fixture.runtime.connect(); client.release();
  const consume = authRateLimiter({ query: async () => { throw new Error("synthetic outage"); } }, fixture.derivationSecret);
  await assert.rejects(consume("outage", { window: 60, max: 1 }));
});
test("Better Auth itself disables signup even without the restricted HTTP gateway", async () => {
  const auth = createDiaryAuth({ pool: fixture.runtime, origin: fixture.env.APP_ORIGIN, secret: fixture.secret, secure: true, mail: async () => {}, consume: authRateLimiter(fixture.runtime, fixture.derivationSecret) });
  const response = await auth.handler(new Request(`${fixture.env.APP_ORIGIN}/api/auth/sign-up/email`, { method: "POST", headers: { origin: fixture.env.APP_ORIGIN, "content-type": "application/json", "x-diary-trusted-ip": "127.0.0.1" }, body: JSON.stringify({ email: "new@example.invalid", password: "Synthetic-unauthorized-account-123!", name: "Synthetic" }) }));
  assert.equal(response.status, 404);
  await assert.rejects(auth.api.signUpEmail({ body: { email: "new@example.invalid", password: "Synthetic-unauthorized-account-123!", name: "Synthetic" } }));
  assert.equal((await fixture.admin.query("SELECT count(*)::int AS n FROM auth_user")).rows[0].n, 2);
});
test("runtime guard accepts only the restricted role and rejects an operator connection", async () => {
  await assertAuthRuntime(fixture.runtime);
  await assert.rejects(assertAuthRuntime(fixture.admin), { message: "Auth runtime privileges are unsafe" });
});
test("runtime guard detects accidental column grants that could rebind ownership", async () => {
  await fixture.admin.query("GRANT UPDATE(auth_user_id) ON private.diary_owner TO diary_auth_runtime");
  try { await assert.rejects(assertAuthRuntime(fixture.runtime), { message: "Auth runtime privileges are unsafe" }); }
  finally { await fixture.admin.query("REVOKE UPDATE(auth_user_id) ON private.diary_owner FROM diary_auth_runtime"); }
  await assertAuthRuntime(fixture.runtime);
});
test("HMAC subkeys match the documented HKDF inputs and separate purposes", () => {
  const expected = Buffer.from(hkdfSync("sha256", Buffer.from(fixture.derivationSecret, "base64url"), "dear-diary/auth-derivations/v1", "dear-diary/rate-limit/v1", 32));
  assert.ok(derivationKey(fixture.derivationSecret, "rate-limit").equals(expected));
  assert.ok(!derivationKey(fixture.derivationSecret, "workspace").equals(expected));
  assert.notEqual(limitIdentity("native", "a", "b"), limitIdentity("destination", "a", "b"));
  assert.notEqual(limitIdentity("destination", "a:b", "c"), limitIdentity("destination", "a", "b:c"));
});
test("workspace pseudonyms are stable, opaque and distinct for different owners", () => {
  const id = opaqueWorkspaceId(fixture.derivationSecret, fixtureOwner);
  assert.match(id, /^w1_[A-Za-z0-9_-]{43}$/);
  assert.equal(id, opaqueWorkspaceId(fixture.derivationSecret, fixtureOwner.toUpperCase()));
  assert.notEqual(id, opaqueWorkspaceId(fixture.derivationSecret, "87654321-1234-4234-8234-123456789abc"));
  assert.ok(!id.includes(fixtureOwner));
});
test("email and IP normalization merges equivalent identifiers without collapsing mailbox aliases", () => {
  assert.equal(normalizeEmail(" Owner@Example.Invalid "), "owner@example.invalid");
  assert.notEqual(normalizeEmail("owner+one@example.invalid"), normalizeEmail("owner@example.invalid"));
  assert.equal(normalizeIP("2001:0DB8:0001:0002:0003:0004:0005:0006"), normalizeIP("2001:db8:1:2::ffff"));
  assert.equal(normalizeIP("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(normalizeIP("::ffff:c000:201"), "192.0.2.1");
  assert.equal(normalizeIP("192.0.2.1,192.0.2.2"), null);
});
test("missing/invalid derivation secrets fail before any database access", () => {
  let queried = false; const pool = { query: async () => { queried = true; } };
  for (const secret of [undefined, "", " ".repeat(43), "A".repeat(42) + "B"]) assert.throws(() => authRateLimiter(pool, secret));
  assert.equal(queried, false);
});
test("signing-key rotation leaves existing durable buckets and privacy identities unchanged", async () => {
  const identity = limitIdentity("destination", "sign-in/email", normalizeEmail("Privacy@Example.Invalid"));
  const digest = createHmac("sha256", derivationKey(fixture.derivationSecret, "rate-limit")).update(identity).digest("hex");
  const before = authRateLimiter(fixture.runtime, fixture.derivationSecret);
  assert.equal((await before(identity, { window: 900, max: 1 })).allowed, true);
  // New process/config after signing-key rotation still receives the same independent root.
  const after = authRateLimiter(fixture.runtime, fixture.derivationSecret);
  assert.equal((await after(identity, { window: 900, max: 1 })).allowed, false);
  const rows = await fixture.admin.query("SELECT key FROM private.auth_rate_limit WHERE key=$1", [digest]);
  assert.equal(rows.rowCount, 1); assert.ok(!rows.rows[0].key.includes("privacy@example.invalid"));
});
