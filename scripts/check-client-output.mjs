import { readdir, readFile } from "node:fs/promises";

// Synthetic sentinels are set during the verification build, never real credentials.
export const sentinels = [
  "11111111-1111-4111-8111-111111111111",
  "phase1-browser-leak-sentinel",
  "https://phase1-private-config.example.invalid",
];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesIn(path) : [path];
  }));
  return nested.flat();
}

const files = [
  ...await filesIn(".next/static"),
  ...((await filesIn(".next/server/app")).filter((file) => /\.(html|rsc)$/.test(file))),
];
for (const file of files) {
  const text = await readFile(file, "utf8");
  if (sentinels.some((value) => text.includes(value))) {
    throw new Error(`Server configuration sentinel leaked into browser output: ${file}`);
  }
}
console.log(`Client output check passed (${files.length} assets/payloads; three synthetic sentinels).`);
