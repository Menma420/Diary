import { checkPostgresConnection } from "@/lib/postgres.server";
import { ownerResult } from "@/lib/auth/auth.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

// Connectivity only: no entry reads, writes, SQL parameters or private metadata.
export async function GET(request?: Request) {
  const access = await ownerResult(request?.headers);
  if (access.kind !== "owner") return Response.json({ status: "unavailable" }, { status: access.kind === "unavailable" ? 503 : 401, headers });
  try {
    await checkPostgresConnection();
    return Response.json({ status: "ok", services: { postgres: "connected" } }, { headers });
  } catch {
    return Response.json({ status: "unavailable", services: { postgres: "unavailable" } }, { status: 503, headers });
  }
}
