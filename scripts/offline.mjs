import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const index = await readFile("dist/index.html", "utf8");
const assets = (await readdir("dist/assets")).sort();
const shell = [
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./worklets/output-guard.js",
  ...assets.map((file) => "./assets/" + file),
];
const template = await readFile("public/sw.js", "utf8");
if (
  !template.includes("/* SHELL_FILES */ []") ||
  !template.includes('/* INDEX_HTML */ ""') ||
  !template.includes("__VERSION__")
)
  throw new Error("Offline-worker build markers are missing.");
// Public worklet, icon, manifest and worker changes also need a new release cache.
const hash = createHash("sha256").update(template).update(index);
const files = await Promise.all(
  shell.map((path) => readFile("dist/" + path.slice(2))),
);
for (const file of files) hash.update(file);
const version = hash.digest("hex").slice(0, 12);
await writeFile(
  "dist/sw.js",
  template
    .replace("__VERSION__", version)
    .replace("/* SHELL_FILES */ []", JSON.stringify(shell))
    .replace('/* INDEX_HTML */ ""', JSON.stringify(index)),
);
await writeFile("dist/.nojekyll", "");
