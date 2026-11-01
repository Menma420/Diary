import "server-only";
import { normalizeIP, normalizeEmail } from "./identifiers.server";
import { limitIdentity } from "./derivations.server";
import { z } from "zod";
import { authServices, assertAuthRuntime, ownerResult } from "./auth.server";

export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
export function privateJson(body: unknown, status = 200) { return Response.json(body, { status, headers: privateHeaders }); }
const email = z.string().transform(normalizeEmail).pipe(z.email().max(254));
const token = z.string().min(1).max(4096);
const schemas = {
  "sign-in/email": z.strictObject({ email, password: z.string().min(1).max(128) }),
  "sign-out": z.strictObject({}),
  "request-password-reset": z.strictObject({ email }),
  "send-verification-email": z.strictObject({ email }),
  "reset-password": z.strictObject({ token, newPassword: z.string().min(12).max(128) }),
  "verify-email": z.strictObject({ token }),
} as const;

export function trustedClientIP(headers: Headers, vercel: boolean) {
  // Only the hosting platform's overwritten header is trusted, never arbitrary XFF.
  const address = vercel ? headers.get("x-vercel-forwarded-for")?.trim() : null;
  return address ? normalizeIP(address) ?? "127.0.0.1" : "127.0.0.1";
}
export async function authRequest(request: Request, operation: string) {
  if (!Object.hasOwn(schemas, operation) || request.method !== "POST") return privateJson({ error: "Not found" }, 404);
  try {
    const { auth, pool, config, consume } = authServices();
    if (request.headers.get("origin") !== config.APP_ORIGIN || request.headers.get("sec-fetch-site") === "cross-site") return privateJson({ error: "Request origin rejected" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return privateJson({ error: "JSON required" }, 415);
    // Stream with a hard bound, including requests without Content-Length.
    const reader = request.body?.getReader();
    let text = ""; let size = 0;
    if (reader) { const decoder = new TextDecoder(); try { while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 8192) { await reader.cancel(); return privateJson({ error: "Request too large" }, 413); }
      text += decoder.decode(part.value, { stream: true });
    } text += decoder.decode(); } finally { reader.releaseLock(); } }
    let value: unknown;
    try { value = JSON.parse(text); } catch { return privateJson({ error: "Invalid request" }, 400); }
    const parsed = schemas[operation as keyof typeof schemas].safeParse(value);
    if (!parsed.success) return privateJson({ error: "Invalid request" }, 400);
    await assertAuthRuntime(pool);
    const global = await consume(limitIdentity("gateway-global", operation), { window: 60, max: 60 });
    if (!global.allowed) return privateJson({ error: "Too many attempts. Please try later." }, 429);
    const ip = trustedClientIP(request.headers, process.env.VERCEL === "1");
    const gate = await consume(limitIdentity("gateway-ip", operation, ip), { window: 60, max: operation === "sign-in/email" ? 5 : 20 });
    if (!gate.allowed) return privateJson({ error: "Too many attempts. Please try later." }, 429);
    const body: Record<string, unknown> = { ...parsed.data };
    if (operation === "sign-out" && (await ownerResult(request.headers)).kind !== "owner") return privateJson({ error: "Owner access required" }, 401);
    if ("email" in body && typeof body.email === "string") {
      const destination = await consume(limitIdentity("destination", operation, body.email), { window: 900, max: operation === "sign-in/email" ? 10 : 3 });
      if (!destination.allowed) return privateJson({ error: "Too many attempts. Please try later." }, 429);
      if (operation !== "sign-in/email") {
        if (config.AUTH_MAIL_MODE === "unconfigured") return privateJson({ error: "Email recovery is not configured. Contact the operator." }, 503);
        const bound = await pool.query(`SELECT 1 FROM private.diary_owner o JOIN public.auth_user u ON u.id = o.auth_user_id WHERE lower(u.email) = lower($1) AND ($2::boolean = false OR u."emailVerified" = true)`, [body.email, operation === "request-password-reset"]);
        if (bound.rowCount !== 1) return privateJson({ ok: true });
        body.callbackURL = `${config.APP_ORIGIN}/login`;
        if (operation === "request-password-reset") { delete body.callbackURL; body.redirectTo = `${config.APP_ORIGIN}/reset-password`; }
      }
    }
    const url = new URL(`${config.APP_ORIGIN}/api/auth/${operation}`);
    const headers = new Headers({ "content-type": "application/json", origin: config.APP_ORIGIN, "x-diary-trusted-ip": ip, "sec-fetch-site": "same-origin" });
    if (request.headers.get("cookie")) headers.set("cookie", request.headers.get("cookie")!);
    if (operation === "verify-email") url.searchParams.set("token", String(body.token));
    const native = await auth.handler(new Request(url, { method: operation === "verify-email" ? "GET" : "POST", headers, ...(operation === "verify-email" ? {} : { body: JSON.stringify(body) }) }));
    // Never forward the library's token/user payload, raw errors or redirects.
    const response = privateJson(native.ok ? { ok: true } : { error: native.status === 429 ? "Too many attempts. Please try later." : "Unable to complete authentication. Check your details or use recovery." }, native.ok ? 200 : native.status >= 500 ? 503 : native.status);
    for (const cookie of native.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    if (native.headers.has("retry-after")) response.headers.set("retry-after", native.headers.get("retry-after")!);
    return response;
  } catch { return privateJson({ error: "Authentication is temporarily unavailable." }, 503); }
}
