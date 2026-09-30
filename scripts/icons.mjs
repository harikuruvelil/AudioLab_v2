import { readFile, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
for (const size of [192, 512]) {
  const svg = await readFile(`public/icons/icon-${size}.svg`, "utf8");
  await writeFile(
    `public/icons/icon-${size}.png`,
    new Resvg(svg).render().asPng(),
  );
}
