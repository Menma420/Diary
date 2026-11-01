import { expect, test } from "./auth-fixture";

test("native typing, clipboard paste and undo redo survive controlled editor renders", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/diary/31/10/2026");
  const editor = page.getByRole("textbox", { name: "Diary writing preview" });
  await expect(editor).toBeEditable();
  await editor.focus(); await editor.pressSequentially("A quiet day");
  const pasted = "\n  Pasted 🌸 日本語\nSecond paragraph  ";
  await page.evaluate((text) => navigator.clipboard.writeText(text), pasted);
  await editor.press("ControlOrMeta+V"); await expect(editor).toHaveValue(`A quiet day${pasted}`);
  await editor.press("ControlOrMeta+Z"); await expect(editor).toHaveValue("A quiet day");
  await editor.press("ControlOrMeta+Shift+Z"); await expect(editor).toHaveValue(`A quiet day${pasted}`);
  await editor.evaluate((node: HTMLTextAreaElement) => { node.focus(); node.setSelectionRange(2, 8, "backward"); node.dataset.originalNode = "true"; });
  for (const theme of ["sakura-pink", "dreamy-sky", "lavender-dreams", "vintage-journal"]) {
    const appearance = page.getByRole("combobox", { name: "Theme preview" });
    await appearance.dispatchEvent("pointerdown"); await appearance.selectOption(theme);
    await expect(editor).toBeFocused(); await expect(editor).toHaveAttribute("data-original-node", "true");
    expect(await editor.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection])).toEqual([2, 8, "backward"]);
    await expect(editor).toHaveValue(`A quiet day${pasted}`);
  }
  await expect(page.locator("#preview-notice")).toHaveText(/Unsaved changes|Saving to server…|Saved/);
});

test("long date-owned drafts restore selection and document scroll through history", async ({ page }) => {
  await page.goto("/diary/31/10/2026"); const editor = page.getByRole("textbox", { name: "Diary writing preview" });
  const content = Array.from({ length: 55 }, (_, index) => `Synthetic line ${index + 1} — date A only`).join("\n");
  await editor.fill(content);
  await editor.evaluate((node: HTMLTextAreaElement) => { node.setSelectionRange(2, 9, "backward"); window.scrollTo(0, 600); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
  // Programmatic activation avoids Playwright scrolling the header into view.
  await page.getByRole("button", { name: "Next day" }).evaluate((node: HTMLButtonElement) => node.click());
  await expect(page).toHaveURL(/\/diary\/01\/11\/2026$/); await expect(editor).toHaveValue("");
  await editor.fill("Date B stays separate"); await page.goBack(); await expect(editor).toHaveValue(content);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
  expect(await editor.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection])).toEqual([2, 9, "backward"]);
  expect(await editor.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goForward(); await expect(editor).toHaveValue("Date B stays separate");
});
