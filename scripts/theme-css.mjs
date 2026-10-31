import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const tokens = JSON.parse(await readFile(new URL("src/themes/tokens.json", root), "utf8"));
const cssPath = new URL("src/themes/themes.css", root);
const kebab = (value) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const output = "/* Generated from tokens.json by pnpm tokens:generate. */\n"
  + tokens.map((theme, index) => {
    const { id, shadow } = theme;
    const selector = `${index === 0 ? ":root,\n" : ""}[data-theme="${id}"]`;
    const variables = Object.entries(theme)
      .filter(([key]) => !["id", "name", "decorationCollectionId", "shadow"].includes(key))
      .map(([key, value]) => `  --color-${kebab(key)}: ${value};`);
    return `${selector} {\n${variables.join("\n")}\n  --shadow-paper: ${shadow};\n}\n`;
  }).join("\n");

if (process.argv.includes("--write")) {
  await writeFile(cssPath, output);
  console.log("Theme CSS generated.");
} else if (await readFile(cssPath, "utf8") !== output) {
  throw new Error("Theme CSS is stale. Run pnpm tokens:generate.");
} else {
  console.log("Theme CSS matches canonical tokens.");
}
