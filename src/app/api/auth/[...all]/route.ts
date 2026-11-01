import { authRequest, privateJson } from "@/lib/auth/http.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ all: string[] }> };
export async function POST(request: Request, context: Context) { return authRequest(request, (await context.params).all.join("/")); }
export function GET() { return privateJson({ error: "Not found" }, 404); }
