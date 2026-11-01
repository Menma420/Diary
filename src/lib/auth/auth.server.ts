import "server-only";
import { headers } from "next/headers";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { postgresPoolOptions } from "../postgres-config";
import { createDiaryAuth } from "./config";
import { parseAuthEnvironment } from "./environment";
import { authRateLimiter } from "./rate-limit";
import { authMailSender } from "./mail";
import { authorizeSession, OwnerAccessError, type OwnerResult, type PublicAccess } from "./owner";
import { assertAuthRuntime } from "./runtime-role.server";
export { assertAuthRuntime } from "./runtime-role.server";
import { opaqueWorkspaceId } from "./derivations.server";

// Cache configuration/connections only. Never cache a user, session or binding.
let services: ReturnType<typeof build> | undefined;
function build() {
  const config = parseAuthEnvironment(process.env);
  const pool = new Pool(postgresPoolOptions(config.AUTH_DATABASE_URL));
  pool.on("error", () => {});
  if (process.env.VERCEL) attachDatabasePool(pool);
  const consume = authRateLimiter(pool, config.AUTH_DERIVATION_SECRET);
  const auth = createDiaryAuth({ pool, origin: config.APP_ORIGIN, secret: config.BETTER_AUTH_SECRET,
    secure: process.env.NODE_ENV === "production" || config.APP_ORIGIN.startsWith("https:"),
    mail: authMailSender(config, consume), consume });
  return { config, pool, auth, consume };
}
export function authServices() { return services ??= build(); }
export function publicAccess(result: OwnerResult, now = new Date()): PublicAccess {
  if (result.kind !== "owner") return result;
  try {
    return { kind: "owner", workspaceId: opaqueWorkspaceId(authServices().config.AUTH_DERIVATION_SECRET, result.owner.ownerId),
      expiresAt: result.owner.expiresAt, checkedAt: now.toISOString() };
  } catch { return { kind: "unavailable" }; }
}
export async function ownerResult(input?: Headers): Promise<OwnerResult> {
  const requestHeaders = input ?? await headers();
  if (!requestHeaders.get("cookie")) return { kind: "anonymous" };
  try {
    const { auth, pool } = authServices();
    await assertAuthRuntime(pool);
    // Do not accept identity headers or bearer tokens. No cookie cache/refresh.
    const session = await auth.api.getSession({ headers: new Headers({ cookie: requestHeaders.get("cookie")! }), query: { disableCookieCache: true } });
    if (!session) return { kind: "anonymous" };
    const { rows } = await pool.query("SELECT owner_id, auth_user_id FROM private.diary_owner");
    return authorizeSession(session, rows);
  } catch { return { kind: "unavailable" }; }
}
export async function requireOwner(input?: Headers) {
  const result = await ownerResult(input);
  if (result.kind !== "owner") throw new OwnerAccessError(result.kind);
  return result.owner;
}
