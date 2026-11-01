import { expect, it } from "vitest";
import { authorizeSession } from "@/lib/auth/owner";
import { parseAuthEnvironment } from "@/lib/auth/environment";
const now = new Date("2026-11-01T00:00:00Z");
const binding = { owner_id: "12345678-1234-4234-8234-123456789abc", auth_user_id: "owner" };
const session = { user: { id: "owner", emailVerified: true }, session: { userId: "owner", createdAt: now, expiresAt: new Date(now.getTime() + 604800000) } };
it("resolves only authoritative verified singleton owner context without token or email", () => {
  const result = authorizeSession(session, [binding], now);
  expect(result.kind).toBe("owner");
  if (result.kind === "owner") expect(result.owner.ownerId).toBe(binding.owner_id);
  if (result.kind === "owner") expect(Object.isFrozen(result.owner)).toBe(true);
});
it.each([null, {}, { ...session, user: { id: "owner", emailVerified: false } }, { ...session, session: { ...session.session, userId: "other" } }])("fails closed for absent or malformed/unverified identity %#", input => {
  expect(authorizeSession(input, [binding], now).kind).not.toBe("owner");
});
it.each([[], [binding, binding], [{ ...binding, auth_user_id: "other" }], [{ ...binding, owner_id: "invalid" }]].map(rows => ({ rows })))("rejects missing, duplicate or mismatched binding %#", ({ rows }) => {
  expect(authorizeSession(session, rows, now).kind).toBe("forbidden");
});
it.each([0, -1, 604800001])("rejects expired or excessive session lifetime %s", duration => {
  expect(authorizeSession({ ...session, session: { ...session.session, expiresAt: new Date(now.getTime() + duration) } }, [binding], now).kind).toBe("anonymous");
});
const env = { APP_ORIGIN: "http://127.0.0.1:3100", AUTH_DATABASE_URL: "postgresql://fixture:synthetic@127.0.0.1/diary_auth_test", BETTER_AUTH_SECRET: "synthetic-secret-with-at-least-32-characters", AUTH_DERIVATION_SECRET: "A".repeat(42) + "E" };
it("auth configuration has no production database or secret fallback", () => {
  expect(() => parseAuthEnvironment({ APP_ORIGIN: env.APP_ORIGIN, DATABASE_URL: env.AUTH_DATABASE_URL })).toThrow("Invalid auth configuration");
  expect(parseAuthEnvironment(env).AUTH_MAIL_MODE).toBe("unconfigured");
});
it.each([
  { APP_ORIGIN: "http://public.example" }, { APP_ORIGIN: "https://example.com/path" }, { AUTH_MAIL_MODE: "brevo" },
  { AUTH_MAIL_MODE: "sink", AUTH_MAIL_SINK_URL: "http://evil.example" },
  { AUTH_MAIL_MODE: "sink", AUTH_MAIL_SINK_URL: "http://127.0.0.1:5000", AUTH_DATABASE_URL: "postgresql://fixture:synthetic@remote.example/db" },
])("rejects unsafe auth/mail configuration %#", value => { expect(() => parseAuthEnvironment({ ...env, ...value })).toThrow(); });
it.each([undefined, "", " ".repeat(43), "short", "A".repeat(42) + "B", "A".repeat(44)])("rejects missing or noncanonical derivation secrets %#", AUTH_DERIVATION_SECRET => {
  expect(() => parseAuthEnvironment({ ...env, AUTH_DERIVATION_SECRET })).toThrow("AUTH_DERIVATION_SECRET");
});
it("rejects signing-secret absence/invalidity and root reuse without disclosing either value", () => {
  for (const BETTER_AUTH_SECRET of [undefined, "", " ".repeat(32)]) expect(() => parseAuthEnvironment({ ...env, BETTER_AUTH_SECRET })).toThrow();
  expect(() => parseAuthEnvironment({ ...env, BETTER_AUTH_SECRET: env.AUTH_DERIVATION_SECRET })).toThrow("must differ");
  const rotated = parseAuthEnvironment({ ...env, BETTER_AUTH_SECRET: "rotated-signing-secret-at-least-32-characters" });
  expect(rotated.AUTH_DERIVATION_SECRET).toBe(env.AUTH_DERIVATION_SECRET);
});
