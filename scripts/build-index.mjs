import { readdir, readFile, writeFile, mkdir, stat, cp } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const CONTENT = join(ROOT, "content");
const PUBLIC = join(ROOT, "public");

async function walkMetas(dir) {
  const out = [];
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walkMetas(p));
    else if (e.isFile() && e.name.endsWith(".meta.json")) out.push(p);
  }
  return out;
}

async function ensureDir(d) { try { await mkdir(d, { recursive: true }); } catch {} }

async function main() {
  const regPath = join(CONTENT, "models/registry.json");
  const reg = JSON.parse(await readFile(regPath, "utf8"));

  const branches = reg.branches || [];
  const entries = [];

  for (const b of branches) {
    const bdir = join(CONTENT, "models", b);
    try { await stat(bdir); } catch { continue; }
    const metas = await walkMetas(bdir);
    for (const m of metas) {
      const meta = JSON.parse(await readFile(m, "utf8"));
      entries.push({
        branch: b,
        type: meta.type,
        slug: meta.slug,
        path: `/b/${b}/e/${meta.type}/${meta.slug}`,
        meta
      });
    }
  }

  await ensureDir(PUBLIC);
  await ensureDir(join(PUBLIC, "models"));
  await writeFile(join(PUBLIC, "index.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    branches, count: entries.length, entries
  }, null, 2), "utf8");

  await cp(regPath, join(PUBLIC, "models/registry.json"));
  console.log(`[canonAR] index.json: ${entries.length} / models copied`);
}

main().catch(e => { console.error(e); process.exit(1); });
