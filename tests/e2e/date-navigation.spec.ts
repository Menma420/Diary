import { expect, test } from "./auth-fixture";
import AxeBuilder from "@axe-core/playwright";

test("exact URLs, refresh and browser history retain date-owned drafts", async ({ page }) => {
  await page.goto("/diary/31/10/2026");
  const editor = page.getByRole("textbox", { name: "Diary writing preview" });
  await expect(page.locator("time")).toHaveText("31/10/2026");
  await editor.fill("Date A 🌸\n  whitespace");
  await editor.evaluate((node: HTMLTextAreaElement) => { node.focus(); node.setSelectionRange(2, 6, "backward"); });
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page).toHaveURL(/\/diary\/01\/11\/2026$/);
  await expect(editor).toHaveValue(""); await expect(editor).toBeFocused();
  await editor.fill("Date B");
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.locator("time")).toHaveText("31/10/2026"); await expect(editor).toHaveValue("Date A 🌸\n  whitespace");
  expect(await editor.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection])).toEqual([2, 6, "backward"]);
  await page.goBack(); await expect(editor).toHaveValue("Date B");
  await page.goForward(); await expect(editor).toHaveValue("Date A 🌸\n  whitespace");
  await page.reload(); await expect(page.locator("time")).toHaveText("31/10/2026"); await expect(editor).toHaveValue("");
  await expect(page.getByText("Preview · not saved")).toBeVisible();
});

test("fast date switching retains isolated text and explicitly cleared content", async ({ page }) => {
  await page.goto("/diary/28/02/2024"); const editor = page.getByRole("textbox", { name: "Diary writing preview" });
  await editor.fill("February 28 only"); await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.locator("time")).toHaveText("29/02/2024"); await expect(editor).toHaveValue(""); await editor.fill("Leap day only");
  for (let index = 0; index < 4; index++) {
    await page.getByRole("button", { name: "Previous day" }).click(); await expect(editor).toHaveValue("February 28 only");
    await page.getByRole("button", { name: "Next day" }).click(); await expect(editor).toHaveValue("Leap day only");
  }
  await editor.fill(""); await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.locator("time")).toHaveText("01/03/2024"); await editor.fill("March only");
  await page.getByRole("button", { name: "Previous day" }).click(); await expect(editor).toHaveValue("");
  await page.getByRole("button", { name: "Next day" }).click(); await expect(editor).toHaveValue("March only");
});

test("root and diary index resolve to today's Kolkata date", async ({ page }) => {
  for (const path of ["/", "/diary"]) {
    await page.goto(path);
    const expected = await page.evaluate(() => {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      const get = (type: string) => parts.find((p) => p.type === type)!.value;
      return `${get("day")}/${get("month")}/${get("year")}`;
    });
    await expect(page).toHaveURL(new RegExp(`/diary/${expected}$`));
  }
});

test("Today recomputes Kolkata midnight after sleep independent of browser timezone and locale", async ({ browser, context: ownerContext }) => {
  const context = await browser.newContext({ timezoneId: "America/Los_Angeles", locale: "en-US", storageState: await ownerContext.storageState() }); const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-12-31T18:29:59Z") }); await page.goto("/diary/01/01/2020");
  await page.clock.setSystemTime(new Date("2026-12-31T18:30:01Z")); await expect(page.locator("time")).toHaveText("01/01/2020");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/diary\/01\/01\/2027$/); await expect(page.locator("time")).toHaveText("01/01/2027"); await context.close();
});

test("calendar supports month/year jumps, selected date, validation and keyboard navigation", async ({ page }) => {
  await page.goto("/diary/29/02/2024"); await page.getByRole("button", { name: "Open calendar" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("gridcell", { selected: true })).toContainText("29");
  await expect(dialog.getByRole("button", { name: "29/02/2024", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Next month" }).click(); await expect(dialog.getByRole("heading")).toHaveText("March 2024");
  await dialog.getByRole("button", { name: "Previous month" }).click();
  const jump = dialog.getByRole("textbox", { name: "Jump to a date" });
  await jump.fill("29/02/2026"); await dialog.getByRole("button", { name: "Go", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter a real date as DD/MM/YYYY.");
  await jump.fill("31/12/0099"); await dialog.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page).toHaveURL(/\/diary\/31\/12\/0099$/); await expect(page.locator("time")).toHaveText("31/12/0099");
  await expect(page.getByRole("button", { name: "Open calendar" })).toBeFocused();
  await page.getByRole("button", { name: "Next day" }).click(); await expect(page).toHaveURL(/\/diary\/01\/01\/0100$/);
  await page.getByRole("button", { name: "Open calendar" }).click();
  await dialog.getByRole("button", { name: "01/01/0100", exact: true }).press("ArrowRight");
  await expect(dialog.getByRole("button", { name: "02/01/0100", exact: true })).toBeFocused();
  await page.keyboard.press("PageDown"); await expect(dialog.getByRole("heading")).toHaveText("February 0100");
  await page.keyboard.press("Shift+PageDown"); await expect(dialog.getByRole("heading")).toHaveText("February 0101");
  await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/diary\/02\/02\/0101$/);
  await page.getByRole("button", { name: "Open calendar" }).click(); await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible(); await expect(page.getByRole("button", { name: "Open calendar" })).toBeFocused();
});

test("calendar Today, focus containment and mobile geometry are accessible in all themes", async ({ page }) => {
  await page.goto("/diary/31/10/2026"); await page.clock.install({ time: new Date("2027-01-01T00:00:00Z") });
  for (const theme of ["sakura-pink", "dreamy-sky", "lavender-dreams", "vintage-journal"]) {
    await page.getByRole("combobox", { name: "Theme preview" }).selectOption(theme);
    await page.getByRole("button", { name: "Open calendar" }).click();
    const dialog = page.getByRole("dialog"); const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const control of await dialog.locator("button, input").all()) {
      const bounds = await control.boundingBox(); expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true); }
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations)).toEqual([]);
    await dialog.getByRole("button", { name: "Today", exact: true }).click(); await expect(page).toHaveURL(/\/diary\/01\/01\/2027$/);
  }
});

test("invalid routes expose no blank editor and date bounds are safe", async ({ page }) => {
  for (const date of ["29/02/2026", "29/02/1900", "01/13/2026", "01/2/2026", "01/01/0000", "not-a-date/01/2026"]) {
    const response = await page.goto(`/diary/${date}`); expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This date is not valid" })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(await page.locator('meta[name="robots"]').evaluateAll((nodes) => nodes.some((node) => node.getAttribute("content")?.includes("noindex")))).toBe(true);
  }
  await page.goto("/diary/01/01/0001"); await expect(page.getByRole("button", { name: "Previous day" })).toBeDisabled();
  await page.goto("/diary/31/12/9999"); await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled();
});

test("a late obsolete route response cannot replace the newer date or draft", async ({ page }) => {
  let release!: () => void; let intercepted!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }); const requested = new Promise<void>((resolve) => { intercepted = resolve; });
  await page.route(/\/diary\/01\/11\/2026\?/, async (route) => { intercepted(); await gate; await route.continue().catch(() => {}); });
  await page.goto("/diary/31/10/2026"); const editor = page.getByRole("textbox", { name: "Diary writing preview" }); await editor.fill("October 31 only");
  await page.getByRole("button", { name: "Next day" }).click(); await requested;
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/\/diary\/30\/10\/2026$/); await expect(editor).toHaveValue(""); await editor.fill("October 30 only");
  release(); await page.unrouteAll({ behavior: "wait" }); await expect(page.locator("time")).toHaveText("30/10/2026"); await expect(editor).toHaveValue("October 30 only");
  await page.getByRole("button", { name: "Next day" }).click(); await expect(editor).toHaveValue("October 31 only");
});

test("a later deliberate focus choice cancels pending navigation's editor focus", async ({ page }) => {
  let release!: () => void; let intercepted!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }); const requested = new Promise<void>((resolve) => { intercepted = resolve; });
  await page.route(/\/diary\/01\/11\/2026\?/, async (route) => { intercepted(); await gate; await route.continue().catch(() => {}); });
  await page.goto("/diary/31/10/2026"); const editor = page.getByRole("textbox", { name: "Diary writing preview" }); await editor.fill("Keep October writing");
  await page.getByRole("button", { name: "Next day" }).click(); await requested;
  await page.getByRole("combobox", { name: "Theme preview" }).focus(); release();
  await expect(page).toHaveURL(/\/diary\/01\/11\/2026$/); await expect(editor).toHaveValue(""); await expect(editor).not.toBeFocused();
});
