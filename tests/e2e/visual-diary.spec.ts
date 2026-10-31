import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("appearance and date fixtures preserve writing node, focus, selection and geometry", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Diary writing preview" });
  await editor.fill("Synthetic preview writing\nsecond line 🌸");
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(3, 12, "backward");
    element.dataset.originalNode = "true";
  });
  const before = await editor.boundingBox();
  // Simulate the pointer start before native OS selection completes.
  const appearance = page.getByRole("combobox", { name: "Theme preview" });
  await appearance.dispatchEvent("pointerdown");
  await appearance.selectOption("lavender-dreams");
  await expect(editor).toBeFocused();
  expect(await editor.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd, element.selectionDirection])).toEqual([3, 12, "backward"]);
  await page.getByRole("button", { name: "Next preview date" }).click();
  await expect(page.locator("time")).toHaveText("1 November 2026");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute("data-original-node", "true");
  await expect(editor).toHaveValue("Synthetic preview writing\nsecond line 🌸");
  expect(await editor.boundingBox()).toEqual(before);
  await page.waitForTimeout(200);
  await expect(editor).toBeFocused();
});

test("paper reserves decoration space and rules share the text line height", async ({ page }) => {
  await page.goto("/");
  const geometry = await page.evaluate(() => {
    const editor = document.querySelector("textarea")!;
    const date = document.querySelector("time")!;
    const stickers = [...document.querySelectorAll('[data-artwork] > div')];
    const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const style = getComputedStyle(editor);
    return {
      count: stickers.length,
      overlaps: stickers.some((sticker) => intersects(sticker.getBoundingClientRect(), editor.getBoundingClientRect()) || intersects(sticker.getBoundingClientRect(), date.getBoundingClientRect())),
      lineHeight: style.lineHeight,
      ruleSpacing: style.backgroundSize,
      decorative: stickers.every((sticker) => getComputedStyle(sticker.parentElement!).pointerEvents === "none"),
    };
  });
  expect(geometry.count).toBe(4);
  expect(geometry.overlaps).toBe(false);
  expect(geometry.ruleSpacing).toBe(`100% ${geometry.lineHeight}`);
  expect(geometry.decorative).toBe(true);
  const controls = page.locator("button, select");
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("long writing grows the document and stays inside the paper after viewport changes", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox");
  await editor.fill(Array.from({ length: 45 }, (_, i) => `Synthetic line ${i + 1}: a quiet writing preview 🌷`).join("\n"));
  expect(await editor.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await page.setViewportSize({ width: 320, height: 550 });
  await expect.poll(() => editor.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const bodyHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(bodyHeight).toBeGreaterThan(550);
  await editor.focus();
  await editor.press("ControlOrMeta+End");
  const scrollY = await page.evaluate(() => window.scrollY);
  await editor.pressSequentially(" more writing");
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(scrollY - 2);
});

test("desktop rules fill available paper and shrink back after long writing or a shorter viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1053, height: 900 });
  await page.goto("/");
  const editor = page.getByRole("textbox");
  const paper = page.getByRole("region", { name: "Diary paper" });
  const tall = await editor.boundingBox();
  expect(tall!.height).toBeGreaterThanOrEqual(44 * 10);
  const bottomSticker = page.locator('[data-artwork] > div').nth(2);
  expect(tall!.y + tall!.height).toBeLessThan((await bottomSticker.boundingBox())!.y);

  await page.setViewportSize({ width: 1053, height: 662 });
  await expect.poll(async () => (await paper.boundingBox())!.height).toBeLessThanOrEqual(502);
  const short = await editor.boundingBox();
  expect(short!.height).toBeGreaterThanOrEqual(44 * 5);
  expect(short!.height).toBeLessThan(tall!.height);
  await editor.fill(Array.from({ length: 45 }, (_, i) => `Synthetic line ${i + 1}`).join("\n"));
  expect((await paper.boundingBox())!.height).toBeGreaterThan(1500);
  await editor.fill("A short thought");
  await expect.poll(async () => (await editor.boundingBox())!.height).toBe(short!.height);
  expect((await paper.boundingBox())!.height).toBeLessThanOrEqual(502);
  expect(await editor.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
});

test("keyboard focus is visible and theme changes do not steal it from controls", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const previous = page.getByRole("button", { name: "Previous preview date" });
  await expect(previous).toBeFocused();
  expect(await previous.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
  const appearance = page.getByRole("combobox", { name: "Theme preview" });
  await appearance.focus();
  await appearance.selectOption("vintage-journal");
  await expect(appearance).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox")).toBeFocused();
});

test("all themes pass automated WCAG A/AA checks", async ({ page }) => {
  await page.goto("/");
  for (const theme of ["sakura-pink", "dreamy-sky", "lavender-dreams", "vintage-journal"]) {
    await page.getByRole("combobox", { name: "Theme preview" }).selectOption(theme);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations, `${theme}: ${JSON.stringify(result.violations)}`).toEqual([]);
  }
});

test("200 percent reflow and reduced motion keep all controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 526, height: 331 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--duration-appearance").trim())).toMatch(/^0(?:ms|s)$/);
  const editor = page.getByRole("textbox");
  await editor.fill("Synthetic zoom check");
  await expect(editor).toHaveValue("Synthetic zoom check");
  await page.getByRole("combobox", { name: "Theme preview" }).selectOption("dreamy-sky");
  await expect(editor).toHaveValue("Synthetic zoom check");
});
