import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const directory = new URL("../artifacts/phase-2/", import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:3000";
const cases = [
  { name: "desktop", width: 1053, height: 662 },
  { name: "desktop-tall", width: 1053, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "mobile-320", width: 320, height: 740 },
  { name: "landscape", width: 844, height: 390 },
  { name: "zoom-200-reflow", width: 526, height: 331, deviceScaleFactor: 2 },
];
const metrics = [];

try {
  for (const item of cases) {
    const context = await browser.newContext({
      viewport: { width: item.width, height: item.height },
      deviceScaleFactor: item.deviceScaleFactor ?? 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(baseURL);
    await page.getByRole("textbox").waitFor();
    // Wait for the client layout effect before screenshot's caret styling runs.
    await page.waitForFunction(() => Boolean(document.querySelector("textarea")?.style.height));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
    });
    await page.screenshot({ path: new URL(`${item.name}.png`, directory).pathname, fullPage: true });
    metrics.push({
      ...item,
      browserErrors: errors,
      ...await page.evaluate(() => {
        const box = (element) => {
          const r = element.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        const editor = document.querySelector("textarea");
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          paper: box(document.querySelector("section")),
          date: box(document.querySelector("time")),
          editor: box(editor),
          lineHeight: getComputedStyle(editor).lineHeight,
          rules: getComputedStyle(editor).backgroundSize,
          fontFamily: getComputedStyle(editor).fontFamily,
          fontWeight: getComputedStyle(editor).fontWeight,
          dateFontWeight: getComputedStyle(document.querySelector("time")).fontWeight,
        };
      }),
    });
    if (errors.length) throw new Error(`Browser errors during ${item.name}: ${errors.join("; ")}`);
    if (item.name === "desktop") {
      for (const theme of ["dreamy-sky", "lavender-dreams", "vintage-journal"]) {
        await page.getByRole("combobox", { name: "Theme preview" }).selectOption(theme);
        await page.screenshot({ path: new URL(`${theme}.png`, directory).pathname, fullPage: true });
      }
    }
    await context.close();
  }
  await writeFile(new URL("layout-metrics.json", directory), JSON.stringify(metrics, null, 2) + "\n");
  const reference = process.env.REFERENCE_IMAGE ?? "/home/menma/Pictures/Screenshots/Screenshot from 2026-10-31 19-32-50.png";
  const [original, implementation] = await Promise.all([
    readFile(reference), readFile(new URL("desktop.png", directory)),
  ]);
  const comparison = await browser.newPage({ viewport: { width: 1440, height: 540 }, deviceScaleFactor: 1 });
  await comparison.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Phase 2 reference comparison</title><style>
    body{margin:0;padding:20px;background:#f3f0f2;color:#493b46;font:15px system-ui}
    h1{margin:0 0 16px;font-size:20px;font-weight:600}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    figure{margin:0;min-width:0}figcaption{margin-bottom:8px}img{display:block;width:100%;height:auto;border-radius:6px}
    p{font-size:12px;margin:12px 0 0}
  </style></head><body><h1>Dear Diary — direct visual comparison</h1><main>
    <figure><figcaption>Original supplied reference · 1053 × 662</figcaption><img alt="Original supplied screenshot" src="data:image/png;base64,${original.toString("base64")}"></figure>
    <figure><figcaption>Phase 2 production preview · 1053 × 662</figcaption><img alt="Implemented desktop preview" src="data:image/png;base64,${implementation.toString("base64")}"></figure>
    </main><p>Approved adaptations: paper date and compact navigation. Temporary original illustrations; preview status never claims server saving.</p></body></html>`);
  await comparison.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
  await comparison.screenshot({ path: new URL("reference-comparison.png", directory).pathname, fullPage: true });
  console.log(`Captured ${cases.length} viewports, three alternate themes and direct reference comparison in artifacts/phase-2.`);
} finally {
  await browser.close();
}
