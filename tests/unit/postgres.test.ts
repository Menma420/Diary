import { expect, it, vi } from "vitest";
import { postgresPoolOptions } from "@/lib/postgres-config";
import { GET } from "@/app/api/health/postgres/route";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/lib/postgres.server", () => ({ checkPostgresConnection: check }));
it("uses strict TLS and bounded Node connections without editing the injected URL", () => {
  const url = "postgresql://synthetic:secret@ep-example-pooler.neon.tech/neondb?sslmode=require&channel_binding=require";
  const options = postgresPoolOptions(url);
  expect(new URL(options.connectionString!).searchParams.get("sslmode")).toBe("verify-full");
  expect(new URL(options.connectionString!).searchParams.get("channel_binding")).toBe("require");
  expect(options).toMatchObject({ max: 2, connectionTimeoutMillis: 10_000, query_timeout: 10_000, enableChannelBinding: true });
  expect(url).toContain("sslmode=require");
});
it.each(["sensitive-invalid-value", "https://user:secret@example.com/db", "postgresql://example.com/db", "postgresql://user:secret@example.com/"])("rejects invalid database configuration without exposing it", (url) => {
  expect(() => postgresPoolOptions(url)).toThrow("Invalid DATABASE_URL");
  expect(() => postgresPoolOptions(url)).not.toThrow(url);
});
it("health success requires an actual successful server-side probe and is not cached", async () => {
  check.mockResolvedValueOnce(undefined);
  const response = await GET(); expect(check).toHaveBeenCalledOnce(); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", services: { postgres: "connected" } });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("health failures return 503 without leaking driver errors or credentials", async () => {
  check.mockRejectedValueOnce(new Error("postgresql://owner:secret@private.example/db"));
  const response = await GET(); expect(response.status).toBe(503);
  expect(await response.text()).toBe('{"status":"unavailable","services":{"postgres":"unavailable"}}');
});
