import type { PoolConfig } from "pg";

// Safe validation errors never echo the URL, username or password.
export function postgresPoolOptions(value: string): PoolConfig {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.pathname.length < 2) {
    throw new Error("Invalid DATABASE_URL");
  }
  // pg URL SSL parameters override a separate ssl config. Verify both the
  // certificate and hostname, even when Neon supplied sslmode=require.
  url.searchParams.set("sslmode", "verify-full");
  return {
    connectionString: url.toString(), enableChannelBinding: true,
    max: 2, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000,
    query_timeout: 10_000, application_name: "dear-diary",
  };
}
