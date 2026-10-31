import { expect, test } from "@playwright/test";

test("foundation loads without overflow, editing, or false save feedback", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Dear Diary");
  await expect(page.getByRole("heading", { name: "Dear Diary" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText(/^Saved$/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("all four token sets reach the browser; server configuration does not", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sakura-pink");
  // Fixture-only attribute changes verify CSS delivery; no product selector is implemented.
  for (const [id, background] of [
    ["sakura-pink", "rgb(247, 234, 241)"],
    ["dreamy-sky", "rgb(221, 242, 245)"],
    ["lavender-dreams", "rgb(238, 232, 247)"],
    ["vintage-journal", "rgb(241, 233, 218)"],
  ] as const) {
    await page.locator("html").evaluate((element, theme) => element.setAttribute("data-theme", theme), id);
    await expect(page.locator("body")).toHaveCSS("background-color", background);
  }
  const html = await page.content();
  for (const sentinel of ["11111111-1111-4111-8111-111111111111", "phase1-browser-leak-sentinel", "phase1-private-config.example.invalid"]) {
    expect(html).not.toContain(sentinel);
  }
});
