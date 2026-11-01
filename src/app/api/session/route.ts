import { ownerResult } from "@/lib/auth/auth.server";
import { publicAccess } from "@/lib/auth/auth.server";
import { privateJson } from "@/lib/auth/http.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const result = await ownerResult(request.headers);
  const access = publicAccess(result);
  return privateJson(access, access.kind === "owner" ? 200 : access.kind === "unavailable" ? 503 : access.kind === "forbidden" ? 403 : 401);
}
