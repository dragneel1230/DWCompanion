// Runs the mod-name matcher on saved OCR lines (JSON from the Rust test in src-tauri/src/inventory.rs).
// Usage: node scripts/test-modmatch.mjs lines.json
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Node strips the TypeScript types itself; the two modules are joined into one file (no $lib alias).
const src = ["src/lib/fuzzy.ts", "src/lib/modMatch.ts"]
  .map((f) => readFileSync(f, "utf8").replace(/^import .*$/gm, ""))
  .join("\n");
const tmp = join(mkdtempSync(join(tmpdir(), "modmatch-")), "modMatch.ts");
writeFileSync(tmp, src);
const { buildIndex, namesIn } = await import(pathToFileURL(tmp).href);

const text = readFileSync(process.argv[2], "utf8");
const lines = JSON.parse(text.slice(text.indexOf("JSON") + 4).split("\n")[0]);
const idx = buildIndex(JSON.parse(readFileSync("static/data/frames.json", "utf8")).modNames);
const t = performance.now();
const { hits, used } = namesIn(lines, idx);
console.log(`${hits.length} hits, ${(performance.now() - t).toFixed(0)} ms`);
const names = new Map();
for (const h of hits) names.set(h.entry.name, h.lines.map((l) => l.text).join(" / "));
for (const [n, from] of names) console.log(`  ${n}  <-  ${from}`);
console.log("unmatched:", lines.filter((l) => !used.has(l)).map((l) => l.text).join(" · "));
