import { requireOwner } from "@/lib/auth/auth.server";
import { OwnerAccessError } from "@/lib/auth/owner";
import { privateJson } from "@/lib/auth/http.server";
import { dateFromRoute, type DateRouteParams } from "@/lib/dates";
import { entryWriteSchema } from "@/lib/diary/persistence-contracts";
import { readEntry, writeEntry } from "@/lib/diary/repository.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<DateRouteParams> };
function failure(error: unknown) {
  if (error instanceof OwnerAccessError) return privateJson({ error: "Owner access required" }, error.kind === "anonymous" ? 401 : error.kind === "forbidden" ? 403 : 503);
  if (typeof error === "object" && error && "code" in error && error.code === "22023") return privateJson({ error: "Invalid mutation" }, 400);
  return privateJson({ error: "Diary service unavailable" }, 503);
}
export async function GET(request: Request, context: Context) {
  try {
    const owner = await requireOwner(request.headers);
    const date = dateFromRoute(await context.params);
    if (!date) return privateJson({ error: "Invalid date" }, 400);
    return privateJson({ kind: "loaded", entry: await readEntry(owner,date) });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    await requireOwner(request.headers);
    if (request.headers.get("origin") !== process.env.APP_ORIGIN || request.headers.get("sec-fetch-site") === "cross-site") return privateJson({ error: "Request origin rejected" },403);
    const date = dateFromRoute(await context.params);
    if (!date) return privateJson({ error: "Invalid date" },400);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return privateJson({ error: "JSON required" },415);
    // JSON may escape every content byte. Bound the stream, not just Content-Length.
    const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let length=0;
    if (reader) try { while (true) {
      const part=await reader.read(); if (part.done) break;
      length+=part.value.byteLength;
      if (length>262144*6+1024) { await reader.cancel(); return privateJson({ error: "Request too large" },413); }
      chunks.push(part.value);
    } } finally { reader.releaseLock(); }
    const bytes=new Uint8Array(length); let offset=0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
    let body: unknown;
    try { body=JSON.parse(new TextDecoder("utf-8",{ fatal: true }).decode(bytes)); } catch { return privateJson({ error: "Invalid request" },400); }
    const parsed=entryWriteSchema.safeParse(body);
    if (!parsed.success) return privateJson({ error: "Invalid request or content exceeds 256 KiB" },400);
    const owner=await requireOwner(request.headers);
    const result=await writeEntry(owner,date,parsed.data);
    return privateJson(result,result.kind === "conflict" ? 409 : 200);
  } catch (error) { return failure(error); }
}
