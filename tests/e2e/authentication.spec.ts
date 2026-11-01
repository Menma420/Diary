import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { hashPassword, makeSignature } from "better-auth/crypto";
import { email, password, fixtureAdmin, resetLimits } from "./auth-fixture";
const origin = "http://127.0.0.1:3100";
const post = (request: APIRequestContext, op: string, data: object, headers: Record<string, string> = {}) => request.post(`/api/auth/${op}`, { headers: { origin, ...headers }, data });
async function login(request: APIRequestContext) { const result = await post(request, "sign-in/email", { email, password }); expect(result.status()).toBe(200); return result; }
async function mail() {
  const response = await fetch(`${process.env.AUTH_MAIL_SINK_URL}/messages`, { headers: { authorization: `Bearer ${process.env.DIARY_TEST_CONTROL}` } });
  return await response.json() as { to: string; kind: string; url: string }[];
}
async function forgedSession(context: BrowserContext, user = "fixture-other", expired = false) {
  const token = randomBytes(32).toString("hex"); const pool = await fixtureAdmin();
  try { await pool.query('INSERT INTO auth_session (id,token,"userId","createdAt","updatedAt","expiresAt") VALUES ($1,$1,$2,now()-interval \'1 day\',now(),now()+($3 * interval \'1 second\'))', [token, user, expired ? -60 : 600]); } finally { await pool.end(); }
  const signature = await makeSignature(token, process.env.BETTER_AUTH_SECRET!);
  await context.addCookies([{ name: "__Secure-dear-diary.session_token", value: encodeURIComponent(`${token}.${signature}`), domain: "127.0.0.1", path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
}
test.beforeEach(async () => {
  await resetLimits(); const pool = await fixtureAdmin();
  try {
    await pool.query('UPDATE auth_user SET "emailVerified"=true');
    await pool.query("UPDATE auth_account SET password=$1", [await hashPassword(password)]);
    await pool.query("DELETE FROM auth_session; DELETE FROM auth_verification");
  } finally { await pool.end(); }
});
test("anonymous routes expose no editor; login has safe HTTP policies and keyboard access", async ({ page, request }) => {
  for (const route of ["/", "/diary", "/diary/31/10/2026"]) {
    const response = await page.goto(route);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(page.locator("textarea#diary-writing")).toHaveCount(0);
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    const html = await page.content(); expect(html.includes("data-editor-date")).toBe(false);
  }
  const response = await request.get("/login");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["content-security-policy"]).not.toContain("unsafe-eval");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect((await request.get("/api/session")).status()).toBe(401);
  expect((await request.get("/api/health/postgres")).status()).toBe(401);
  await page.goto("/login"); await page.keyboard.press("Tab"); await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("synthetic owner signs in with explicit safe seven-day cookie and sanitized JSON", async ({ page, context }) => {
  const response = await login(context.request);
  expect(await response.json()).toEqual({ ok: true });
  const cookie = response.headers()["set-cookie"] ?? "";
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=604800", "Path=/"]) expect(cookie.includes(flag)).toBe(true);
  expect(cookie.toLowerCase().includes("domain=")).toBe(false);
  expect((await context.request.get("/api/session")).status()).toBe(200);
  const dto = await (await context.request.get("/api/session")).json();
  expect(Object.keys(dto).sort()).toEqual(["checkedAt", "expiresAt", "kind", "workspaceId"]);
  expect(dto.workspaceId).toMatch(/^w1_[A-Za-z0-9_-]{43}$/);
  const sessionBody = JSON.stringify(dto);
  expect(sessionBody.includes("12345678-1234-4234-8234-123456789abc")).toBe(false);
  expect(sessionBody.includes("fixture-owner")).toBe(false);
  const repeated = await (await context.request.get("/api/session")).json();
  expect(repeated.workspaceId).toBe(dto.workspaceId);
  await page.goto("/diary/31/10/2026"); await expect(page.getByRole("textbox", { name: "Diary writing preview" })).toBeVisible();
  expect((await page.content()).includes("12345678-1234-4234-8234-123456789abc")).toBe(false);
  await page.getByRole("button", { name: "Next day" }).click(); await expect(page).toHaveURL(/01\/11\/2026$/);
  const pool = await fixtureAdmin(); try {
    const result = await pool.query('SELECT extract(epoch FROM ("expiresAt"-"createdAt")) AS seconds, "ipAddress", "userAgent" FROM auth_session');
    expect(Number(result.rows[0].seconds)).toBeLessThanOrEqual(604800);
    expect(result.rows[0].ipAddress).toBeNull(); expect(result.rows[0].userAgent).toBeNull();
  } finally { await pool.end(); }
});
test("invalid password, unverified owner, closed signup and unapproved endpoints fail", async ({ request }) => {
  expect((await post(request, "sign-in/email", { email, password: "wrong-password" })).ok()).toBe(false);
  const pool = await fixtureAdmin(); try { await pool.query('UPDATE auth_user SET "emailVerified"=false WHERE id=\'fixture-owner\''); } finally { await pool.end(); }
  expect((await post(request, "sign-in/email", { email, password })).ok()).toBe(false);
  for (const operation of ["sign-up/email", "sign-in/social", "sign-in/anonymous", "get-session", "update-user", "admin/create-user", "change-email", "change-password"]) {
    expect((await post(request, operation, { email, password })).status()).toBe(404);
  }
  expect((await request.get("/api/auth/get-session")).status()).toBe(404);
  const check = await fixtureAdmin(); try { expect((await check.query("SELECT count(*)::int AS n FROM auth_user")).rows[0].n).toBe(2); } finally { await check.end(); }
});
test("CSRF, arbitrary identities, forged cookies and origin requests are rejected", async ({ request, context }) => {
  expect((await post(request, "sign-in/email", { email, password }, { origin: "https://attacker.invalid" })).status()).toBe(403);
  expect((await request.post("/api/auth/sign-in/email", { data: { email, password } })).status()).toBe(403);
  expect((await post(request, "sign-in/email", { email, password, ownerId: "12345678-1234-4234-8234-123456789abc" })).status()).toBe(400);
  await context.addCookies([{ name: "__Secure-dear-diary.session_token", value: "forged-cookie", domain: "127.0.0.1", path: "/", secure: true }]);
  expect((await context.request.get("/api/session")).status()).not.toBe(200);
});
test("second authenticated identity cannot open the diary or acquire an owner session", async ({ page, context }) => {
  expect((await post(context.request, "sign-in/email", { email: "other@example.invalid", password })).ok()).toBe(false);
  await forgedSession(context);
  expect((await context.request.get("/api/session")).status()).toBe(403);
  await page.goto("/diary/31/10/2026"); await expect(page.locator("#diary-writing")).toHaveCount(0);
});
test("expired, revoked, missing binding and database outages fail closed without raw errors", async ({ context }) => {
  await forgedSession(context, "fixture-owner", true);
  expect((await context.request.get("/api/session")).status()).toBe(401);
  await context.clearCookies(); await login(context.request);
  const pool = await fixtureAdmin();
  try {
    await pool.query("DELETE FROM auth_session"); expect((await context.request.get("/api/session")).status()).toBe(401);
    await resetLimits(); await login(context.request);
    await pool.query("ALTER TABLE private.diary_owner RENAME TO owner_unavailable");
    const response = await context.request.get("/api/session"); expect(response.status()).toBe(503);
    expect(await response.json()).toEqual({ kind: "unavailable" });
    const attempt = await post(context.request, "sign-in/email", { email, password }); expect(attempt.status()).toBe(503);
    expect((await attempt.text()).includes("postgres")).toBe(false);
  } finally { await pool.query("ALTER TABLE IF EXISTS private.owner_unavailable RENAME TO diary_owner"); await pool.end(); }
  const admin = await fixtureAdmin();
  try {
    await admin.query("DELETE FROM private.diary_owner");
    expect((await context.request.get("/api/session")).status()).toBe(403);
  } finally { await admin.query("INSERT INTO private.diary_owner (owner_id,auth_user_id) VALUES ('12345678-1234-4234-8234-123456789abc','fixture-owner')"); await admin.end(); }
});
test("durable login limits survive spoofed forwarded addresses and fail closed on limiter outage", async ({ request }) => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => post(request, "sign-in/email", { email, password: "wrong-password" }, { "x-forwarded-for": `192.0.2.${i + 1}`, "x-diary-trusted-ip": `192.0.2.${i + 1}` })));
  expect(results.filter(r => r.status() === 429).length).toBeGreaterThanOrEqual(3);
  const pool = await fixtureAdmin(); try {
    await pool.query("ALTER TABLE private.auth_rate_limit RENAME TO limit_unavailable");
    expect((await post(request, "sign-in/email", { email, password })).status()).toBe(503);
  } finally { await pool.query("ALTER TABLE IF EXISTS private.limit_unavailable RENAME TO auth_rate_limit"); await pool.end(); }
});
test("password recovery uses fragment links, single-use expiring tokens and revokes sessions", async ({ context }) => {
  await login(context.request);
  expect((await post(context.request, "request-password-reset", { email })).status()).toBe(200);
  const message = (await mail()).filter(m => m.kind === "reset").at(-1)!;
  expect(message.url.startsWith(`${origin}/reset-password#token=`)).toBe(true);
  const token = new URLSearchParams(new URL(message.url).hash.slice(1)).get("token")!;
  const resets = await Promise.all(Array.from({ length: 2 }, () => post(context.request, "reset-password", { token, newPassword: "Replacement-synthetic-password-43!" })));
  expect(resets.filter(response => response.status() === 200).length).toBe(1);
  expect((await context.request.get("/api/session")).status()).toBe(401);
  expect((await post(context.request, "reset-password", { token, newPassword: password })).ok()).toBe(false);
  expect((await post(context.request, "request-password-reset", { email })).status()).toBe(200);
  const second = (await mail()).filter(m => m.kind === "reset").at(-1)!;
  const expired = new URLSearchParams(new URL(second.url).hash.slice(1)).get("token")!;
  const pool = await fixtureAdmin(); try { await pool.query('UPDATE auth_verification SET "expiresAt"=now()-interval \'1 minute\''); } finally { await pool.end(); }
  expect((await post(context.request, "reset-password", { token: expired, newPassword: password })).ok()).toBe(false);
  const count = (await mail()).length;
  expect((await post(context.request, "request-password-reset", { email: "unknown@example.invalid" })).status()).toBe(200);
  expect((await mail()).length).toBe(count);
});
test("email verification is owner-only and does not automatically create a session", async ({ request }) => {
  const pool = await fixtureAdmin(); try { await pool.query('UPDATE auth_user SET "emailVerified"=false WHERE id=\'fixture-owner\''); } finally { await pool.end(); }
  expect((await post(request, "send-verification-email", { email })).status()).toBe(200);
  const message = (await mail()).filter(m => m.kind === "verify").at(-1)!;
  const token = new URLSearchParams(new URL(message.url).hash.slice(1)).get("token")!;
  expect((await post(request, "verify-email", { token })).status()).toBe(200);
  // Pinned library verification is idempotent; replay cannot mint a session.
  expect((await post(request, "verify-email", { token })).status()).toBe(200);
  expect((await request.get("/api/session")).status()).toBe(401);
  await login(request);
});
test("known session expiry locks the editor without polling or losing content", async ({ page, context }) => {
  await login(context.request);
  const pool = await fixtureAdmin(); try { await pool.query('UPDATE auth_session SET "expiresAt"=now()+interval \'3 seconds\''); } finally { await pool.end(); }
  await page.goto("/diary/31/10/2026"); await page.locator("#diary-writing").fill("Expiry timer keeps this draft");
  await expect(page.getByRole("heading", { name: "Sign in to continue writing" })).toBeVisible({ timeout: 6000 });
  await expect(page.locator("#diary-writing")).toHaveValue("Expiry timer keeps this draft");
  await expect(page.locator("#diary-writing")).toHaveAttribute("readonly", "");
});
test("expiry locks writing and same-owner reauthentication preserves node, selection, date and scroll", async ({ page, context }) => {
  await login(context.request); await page.goto("/diary/31/10/2026");
  const editor = page.locator("#diary-writing");
  const text = Array.from({ length: 45 }, (_, i) => `Synthetic private draft ${i}`).join("\n");
  await editor.fill(text); await editor.evaluate((node: HTMLTextAreaElement) => { node.focus(); node.setSelectionRange(4, 12, "backward"); node.dataset.original = "yes"; window.scrollTo(0, 500); });
  const pool = await fixtureAdmin(); try { await pool.query("DELETE FROM auth_session"); } finally { await pool.end(); }
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Sign in to continue writing" })).toBeVisible();
  await expect(editor).toHaveAttribute("readonly", ""); await expect(editor).toHaveValue(text);
  await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(editor).toBeVisible(); await expect(editor).toHaveValue(text); await expect(editor).toHaveAttribute("data-original", "yes"); await expect(editor).toBeFocused();
  expect(await editor.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection])).toEqual([4, 12, "backward"]);
  expect(await page.evaluate(() => window.scrollY)).toBe(500);
  await expect(page).toHaveURL(/31\/10\/2026$/); await expect(page.getByText("Preview · not saved")).toBeVisible();
});
test("different identity cannot inherit an existing workspace", async ({ page, context }) => {
  await login(context.request); await page.goto("/diary/31/10/2026"); await page.locator("#diary-writing").fill("Private synthetic draft");
  await forgedSession(context); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Sign in to continue writing" })).toBeVisible();
  await expect(page.locator("#diary-writing")).not.toBeVisible();
  await expect(page.locator("#diary-writing")).toHaveValue("Private synthetic draft");
});
test("a different verified owner pseudonym cannot unlock the retained workspace", async ({ page, context }) => {
  await login(context.request); await page.goto("/diary/31/10/2026");
  await page.locator("#diary-writing").fill("Original workspace stays private");
  const original = await (await context.request.get("/api/session")).json();
  const pool = await fixtureAdmin();
  try {
    // Operator-only mutation in the disposable fixture, never production/runtime.
    await pool.query("UPDATE private.diary_owner SET owner_id='87654321-1234-4234-8234-123456789abc', auth_user_id='fixture-other'");
    await forgedSession(context);
    const other = await (await context.request.get("/api/session")).json();
    expect(other.kind).toBe("owner"); expect(other.workspaceId).not.toBe(original.workspaceId);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("heading", { name: "Sign in to continue writing" })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("other@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "cannot unlock" })).toBeVisible();
    await expect(page.locator("#diary-writing")).not.toBeVisible();
    await expect(page.locator("#diary-writing")).toHaveValue("Original workspace stays private");
  } finally { await pool.query("UPDATE private.diary_owner SET owner_id='12345678-1234-4234-8234-123456789abc', auth_user_id='fixture-owner'"); await pool.end(); }
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#diary-writing")).toBeVisible();
  await expect(page.locator("#diary-writing")).toHaveValue("Original workspace stays private");
});
test("logout warns, cancellation retains writing, deliberate discard revokes session", async ({ page, context }) => {
  await login(context.request); await page.goto("/diary/31/10/2026"); await page.locator("#diary-writing").fill("Unsaved writing");
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page.getByRole("dialog")).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Keep writing" }).click(); await expect(page.locator("#diary-writing")).toHaveValue("Unsaved writing");
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.getByRole("button", { name: "Discard drafts and sign out" }).click();
  await expect(page).toHaveURL(/\/login$/); await expect(page.locator("#diary-writing")).toHaveCount(0);
  expect((await context.request.get("/api/session")).status()).toBe(401);
});
test("recovery forms are accessible and token fragments never reach requests or HTML", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  for (const route of ["recover", "reset-password", "verify-email"]) {
    await page.goto(`/${route}${route === "recover" ? "" : "#token=synthetic-fragment-leak-sentinel"}`);
    await expect(page).toHaveURL(new RegExp(`/${route}$`));
    expect((await page.content()).includes("synthetic-fragment-leak-sentinel")).toBe(false);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(requests.some(url => url.includes("synthetic-fragment-leak-sentinel"))).toBe(false);
  await page.goto("/login");
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("autocomplete", "username");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("autocomplete", "current-password");
  await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Show password" }).click(); await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Unable to complete" })).toBeVisible();
});
test("capture production Phase 5 review views and layout measurements", async ({ browser }, info) => {
  const name = info.project.name === "chromium" ? "desktop" : info.project.name === "mobile-390" ? "mobile-390" : "mobile-320";
  // Match the Phase 4 capture's CSS-pixel/DPR-1 evidence. The other tests run
  // against the real Pixel device emulation at both mobile widths.
  const context = await browser.newContext({ viewport: name === "desktop" ? { width: 1053, height: 662 } : name === "mobile-390" ? { width: 390, height: 844 } : { width: 320, height: 740 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
  await mkdir("artifacts/phase-5", { recursive: true });
  await page.goto("/login"); await page.screenshot({ path: `artifacts/phase-5/login-${name}.png`, fullPage: true });
  await login(context.request); await page.goto("/diary/31/10/2026");
  await expect(page.locator("#diary-writing")).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  const measurements = [];
  for (const theme of name === "desktop" ? ["sakura-pink", "dreamy-sky", "lavender-dreams", "vintage-journal"] : ["sakura-pink"]) {
    await page.getByRole("combobox", { name: "Theme preview" }).selectOption(theme); await page.getByRole("combobox").blur();
    await page.screenshot({ path: `artifacts/phase-5/diary-${name}-${theme}.png`, fullPage: true });
    measurements.push(await page.evaluate(() => {
      const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { theme: document.documentElement.dataset.theme, paper: box('section[aria-label="Diary paper"]'), editor: box("textarea"), overflow: document.documentElement.scrollWidth > innerWidth, lineHeight: getComputedStyle(document.querySelector("textarea")!).lineHeight };
    }));
  }
  await writeFile(`artifacts/phase-5/layout-${name}.json`, `${JSON.stringify(measurements, null, 2)}\n`);
  if (name === "desktop") {
    await page.getByRole("combobox", { name: "Theme preview" }).selectOption("sakura-pink");
    await page.locator("#diary-writing").fill("Synthetic review draft — retained through reauthentication.\nThis writing has not been saved.");
    await page.screenshot({ path: "artifacts/phase-5/editing-before-reauthentication.png", fullPage: true });
    const pool = await fixtureAdmin(); try { await pool.query("DELETE FROM auth_session"); } finally { await pool.end(); }
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByRole("heading", { name: "Sign in to continue writing" })).toBeVisible();
    await page.screenshot({ path: "artifacts/phase-5/reauthentication.png", fullPage: true });
    await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.locator("#diary-writing")).toBeVisible();
    await expect(page.locator("#diary-writing")).toHaveValue("Synthetic review draft — retained through reauthentication.\nThis writing has not been saved.");
    await page.screenshot({ path: "artifacts/phase-5/editing-after-reauthentication.png", fullPage: true });
    await page.goto("/recover"); await page.screenshot({ path: "artifacts/phase-5/recovery.png", fullPage: true });
  }
  } finally { await context.close(); }
});
