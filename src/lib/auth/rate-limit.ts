import "server-only";
import { createHmac } from "node:crypto";
import type { Pool } from "pg";
import { derivationKey } from "./derivations.server.ts";

// Atomic UPSERT: concurrent callers cannot all observe an available last slot.
// Keys are HMACs, never emails, IP addresses, cookies or library rate-limit keys.
export function authRateLimiter(pool: Pool, secret: string) {
  const keyMaterial = derivationKey(secret, "rate-limit");
  return async (key: string, rule: { window: number; max: number }) => {
    if (!Number.isSafeInteger(rule.window) || !Number.isSafeInteger(rule.max) || rule.window < 1 || rule.max < 1) throw new Error("Invalid rate limit");
    if (typeof key !== "string" || !key.length || Buffer.byteLength(key, "utf8") > 2048) throw new Error("Invalid rate-limit identity");
    const digest = createHmac("sha256", keyMaterial).update(key, "utf8").digest("hex");
    const result = await pool.query<{ allowed: boolean; retry_after: number }>(`
      INSERT INTO private.auth_rate_limit AS bucket (key, count, started_at)
      VALUES ($1, 1, clock_timestamp())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN bucket.started_at + $2 * interval '1 second' <= clock_timestamp() THEN 1 ELSE LEAST(bucket.count + 1, $3 + 1) END,
        started_at = CASE WHEN bucket.started_at + $2 * interval '1 second' <= clock_timestamp() THEN clock_timestamp() ELSE bucket.started_at END
      RETURNING count <= $3 AS allowed,
        GREATEST(1, ceil(EXTRACT(epoch FROM (started_at + $2 * interval '1 second' - clock_timestamp()))))::integer AS retry_after`,
    [digest, rule.window, rule.max]);
    const row = result.rows[0];
    if (!row) throw new Error("Rate limiting unavailable");
    return { allowed: row.allowed, retryAfter: row.allowed ? null : row.retry_after };
  };
}
