import { checkPostgresConnection } from "@/lib/postgres.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

// Connectivity only: no entry reads, writes, SQL parameters or private metadata.
export async function GET() {
  try {
    await checkPostgresConnection();
    return Response.json({ status: "ok", services: { postgres: "connected" } }, { headers });
  } catch {
    return Response.json({ status: "unavailable", services: { postgres: "unavailable" } }, { status: 503, headers });
  }
}
