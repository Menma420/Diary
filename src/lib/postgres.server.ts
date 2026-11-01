import "server-only";
import { parseEnv } from "@neon/env";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import config from "../../neon";
import { postgresPoolOptions } from "./postgres-config";

// Cache only the connection pool, never request identity or diary content.
const databaseGlobal = globalThis as typeof globalThis & { dearDiaryPostgresPool?: Pool };
export function getPostgresPool(): Pool {
  if (databaseGlobal.dearDiaryPostgresPool) return databaseGlobal.dearDiaryPostgresPool;
  let databaseUrl: string;
  try { databaseUrl = parseEnv(config, ["DATABASE_URL"]).postgres.databaseUrl; }
  catch { throw new Error("PostgreSQL configuration is unavailable"); }
  const pool = new Pool(postgresPoolOptions(databaseUrl));
  // pg removes a broken idle client itself. Do not log raw driver errors,
  // which can contain credentials; requests surface sanitized failures.
  pool.on("error", () => {});
  if (process.env.VERCEL) attachDatabasePool(pool);
  databaseGlobal.dearDiaryPostgresPool = pool;
  return pool;
}

export async function checkPostgresConnection(): Promise<void> {
  const result = await getPostgresPool().query<{ connected: number }>("SELECT 1::integer AS connected");
  if (result.rows.length !== 1 || result.rows[0]?.connected !== 1) throw new Error("PostgreSQL connectivity check failed");
}
