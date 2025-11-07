// scripts/validate-json.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const roots = ["content/cards"]; // можно расширять

let bad = 0;
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith(".json")) {
      try {
        const raw = readFileSync(p, "utf8").replace(/^\uFEFF/, ""); // срежем BOM
        JSON.parse(raw);
      } catch (err) {
        bad++;
        console.error(`[json] FAIL: ${p}\n  ${err.message}`);
      }
    }
  }
}

roots.forEach(walk);
if (bad) {
  console.error(`\n[json] ${bad} file(s) invalid. Fix and retry.`);
  process.exit(1);
} else {
  console.log("[json] OK");
}
