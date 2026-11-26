import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const scanRoots = ["src", "apps/web/src"];
const extensions = new Set([".ts", ".html", ".css"]);
const markerPattern = /\\b(TODO|FIXME|HACK)\\b/g;
const counts = { TODO: 0, FIXME: 0, HACK: 0 };
const filesWithMarkers = [];

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(absolute);
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      const source = await readFile(absolute, "utf8");
      const found = [...source.matchAll(markerPattern)].map(match => match[1]);
      if (!found.length) continue;
      for (const marker of found) counts[marker] += 1;
      filesWithMarkers.push({ file: relative(root, absolute), markers: found.length });
    }
  }
}

for (const scanRoot of scanRoots) await visit(resolve(root, scanRoot));
const total = counts.TODO + counts.FIXME + counts.HACK;
process.stdout.write("Debt markers (informational; src + apps/web/src): " +
  "TODO=" + counts.TODO + " FIXME=" + counts.FIXME + " HACK=" + counts.HACK +
  " TOTAL=" + total + "\\n");
for (const item of filesWithMarkers.sort((a, b) => a.file.localeCompare(b.file))) {
  process.stdout.write(item.file + ": " + item.markers + "\\n");
}
