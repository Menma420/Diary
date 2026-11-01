import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const output = new URL("../artifacts/phase-4/", import.meta.url);
const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:3100";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const measurements = [];
try {
  for (const [name, width, height, theme] of [
    ["desktop", 1053, 662, "sakura-pink"], ["mobile", 390, 844, "sakura-pink"], ["mobile-320", 320, 740, "sakura-pink"],
    ["dreamy-sky", 1053, 662, "dreamy-sky"], ["lavender-dreams", 1053, 662, "lavender-dreams"], ["vintage-journal", 1053, 662, "vintage-journal"],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${baseURL}/diary/31/10/2026`);
    await page.waitForFunction(() => Boolean(document.querySelector("textarea")?.style.height));
    if (theme !== "sakura-pink") {
      await page.getByRole("combobox", { name: "Theme preview" }).selectOption(theme);
      await page.getByRole("combobox", { name: "Theme preview" }).blur();
    }
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode())); });
    const bytes = await page.screenshot({ path: new URL(`${name}.png`, output).pathname, fullPage: true });
    const geometry = await page.evaluate(() => {
      const box = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { paper: box(document.querySelector("section")), editor: box(document.querySelector("textarea")),
        overflow: document.documentElement.scrollWidth > innerWidth, lineHeight: getComputedStyle(document.querySelector("textarea")).lineHeight };
    });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    let matchesApprovedPhase3 = null;
    if (theme === "sakura-pink") {
      const approved = await readFile(new URL(`../artifacts/phase-3/${name}.png`, import.meta.url));
      matchesApprovedPhase3 = sha256 === createHash("sha256").update(approved).digest("hex");
    }
    measurements.push({ name, width, height, theme, ...geometry, sha256, matchesApprovedPhase3, browserErrors: errors });
    if (errors.length || geometry.overflow || matchesApprovedPhase3 === false) throw new Error(`Visual regression in ${name}`);
    await context.close();
  }
  await writeFile(new URL("layout-metrics.json", output), `${JSON.stringify(measurements, null, 2)}\n`);
  console.log("Captured six production views; all three Sakura viewports exactly match approved Phase 3 screenshots.");
} finally { await browser.close(); }
