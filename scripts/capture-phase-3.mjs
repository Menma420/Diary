import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const output = new URL("../artifacts/phase-3/", import.meta.url);
await mkdir(output, { recursive: true });
const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:3100";
const browser = await chromium.launch();
const metrics = [];
try {
  for (const [name, width, height] of [["desktop", 1053, 662], ["mobile", 390, 844], ["mobile-320", 320, 740], ["landscape", 844, 390], ["zoom-200-reflow", 526, 331]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${baseURL}/diary/31/10/2026`);
    await page.waitForFunction(() => Boolean(document.querySelector("textarea")?.style.height));
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode())); });
    await page.screenshot({ path: new URL(`${name}.png`, output).pathname, fullPage: true });
    const geometry = await page.evaluate(() => {
      const box = (element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { paper: box(document.querySelector("section")), editor: box(document.querySelector("textarea")), date: document.querySelector("time").textContent, overflow: document.documentElement.scrollWidth > innerWidth, lineHeight: getComputedStyle(document.querySelector("textarea")).lineHeight };
    });
    await page.getByRole("button", { name: "Open calendar" }).click();
    await page.screenshot({ path: new URL(`${name}-calendar.png`, output).pathname });
    const calendar = await page.getByRole("dialog").boundingBox();
    metrics.push({ name, width, height, ...geometry, calendar, browserErrors: errors });
    if (errors.length || geometry.overflow || calendar.x < 0 || calendar.x + calendar.width > width) throw new Error(`Capture failed for ${name}: ${errors.join("; ")}`);
    if (name === "desktop") {
      await page.keyboard.press("Escape");
      const editor = page.getByRole("textbox", { name: "Diary writing preview" });
      await editor.fill("Synthetic date A writing — 31/10/2026\nThis text belongs only to this date.");
      await page.getByRole("button", { name: "Next day" }).click();
      await page.waitForURL("**/diary/01/11/2026");
      await editor.fill("Synthetic date B writing — 01/11/2026\nA separate temporary draft.");
      await page.screenshot({ path: new URL("draft-b.png", output).pathname, fullPage: true });
      await page.getByRole("button", { name: "Previous day" }).click();
      await page.waitForURL("**/diary/31/10/2026");
      if (!await editor.inputValue().then((value) => value.startsWith("Synthetic date A"))) throw new Error("Draft isolation capture failed");
      await page.screenshot({ path: new URL("draft-a-revisited.png", output).pathname, fullPage: true });
    }
    await context.close();
  }
  await writeFile(new URL("layout-metrics.json", output), `${JSON.stringify(metrics, null, 2)}\n`);
  const [phase2, phase3] = await Promise.all([readFile(new URL("../artifacts/phase-2/desktop.png", import.meta.url)), readFile(new URL("desktop.png", output))]);
  const page = await browser.newPage({ viewport: { width: 1440, height: 540 } });
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Phase 2 to Phase 3 comparison</title><style>body{margin:0;padding:20px;background:#f3f0f2;color:#493b46;font:15px Arial,sans-serif}h1{font-size:20px}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{display:block;width:100%;margin-top:8px}</style></head><body><h1>Dear Diary — approved composition preserved</h1><main><figure><figcaption>Approved Phase 2</figcaption><img alt="Phase 2" src="data:image/png;base64,${phase2.toString("base64")}"></figure><figure><figcaption>Phase 3 · DD/MM/YYYY and compact calendar control</figcaption><img alt="Phase 3" src="data:image/png;base64,${phase3.toString("base64")}"></figure></main></body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
  await page.screenshot({ path: new URL("phase-2-comparison.png", output).pathname, fullPage: true });
  console.log("Captured five production viewports with open/closed calendars, isolated drafts and Phase 2 comparison.");
} finally { await browser.close(); }
