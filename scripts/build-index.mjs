import { readdir, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { join, dirname } from "node:path";

const ROOT = process.cwd();
const CONTENT = join(ROOT, "content", "models");
const PUBLIC = join(ROOT, "public");
const SRC_DATA = join(ROOT, "src", "data");

const ensureDir = async (p) => mkdir(p, { recursive: true });

const walkMetaFiles = async (dir) => {
  const out = [];
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkMetaFiles(p)));
    else if (e.isFile() && e.name.endsWith(".meta.json")) out.push(p);
  }
  return out;
};

const slugify = (s) => String(s || "").toLowerCase();

const pluralFromPath = (p) => {
  // .../current/characters/rhiannon.meta.json  => "characters"
  const parts = p.split("/");
  const i = parts.findIndex((t) => t === "current" || t === "pre-rector" || t === "pre-borders");
  return i >= 0 && parts[i + 1] ? parts[i + 1] : "entries";
};

const main = async () => {
  const registryPath = join(CONTENT, "registry.json");
  const metaFiles = await walkMetaFiles(CONTENT);

  const entries = [];
  for (const f of metaFiles) {
    const raw = JSON.parse(await readFile(f, "utf8"));
    const branch = raw.era || "current";
    const type = pluralFromPath(f);
    const slug = slugify(raw.id || raw.name);
    entries.push({
      branch,
      type,
      meta: {
        slug,
        title: raw.name || raw.title || slug,
        subtitle: raw.title || "",
        tags: raw.traits || [],
        param_bindings: raw.param_bindings || {}
      }
    });
  }

  // Ветки и их типы
  const branchesMap = new Map();
  for (const e of entries) {
    const set = branchesMap.get(e.branch) || new Set();
    set.add(e.type);
    branchesMap.set(e.branch, set);
  }
  const branches = [...branchesMap.entries()].map(([name, set]) => ({
    name,
    types: [...set].sort()
  }));

  // Пишем индекс
  const indexObj = {
    generatedAt: new Date().toISOString(),
    branches,
    count: entries.length,
    entries
  };

  // Подготовка папок
  await ensureDir(PUBLIC);
  await ensureDir(SRC_DATA);
  await ensureDir(join(PUBLIC, "models"));
  await ensureDir(join(SRC_DATA, "models"));

  // index.json
  await writeFile(join(PUBLIC, "index.json"), JSON.stringify(indexObj, null, 2), "utf8");
  await writeFile(join(SRC_DATA, "index.json"), JSON.stringify(indexObj, null, 2), "utf8");

  // Списки по ветке/типу
  for (const { name } of branches) {
    const types = branchesMap.get(name);
    for (const t of types) {
      const list = entries
        .filter((e) => e.branch === name && e.type === t)
        .map((e) => ({ slug: e.meta.slug, title: e.meta.title }));

      const pubPath = join(PUBLIC, "b", name);
      const dataPath = join(SRC_DATA, "b", name);
      await ensureDir(pubPath);
      await ensureDir(dataPath);

      await writeFile(join(pubPath, `${t}.json`), JSON.stringify(list, null, 2), "utf8");
      await writeFile(join(dataPath, `${t}.json`), JSON.stringify(list, null, 2), "utf8");
    }
  }

  // registry.json
  await cp(registryPath, join(PUBLIC, "models", "registry.json"));
  await cp(registryPath, join(SRC_DATA, "models", "registry.json"));

  console.log(`[canonAR] Wrote index + lists: ${entries.length} entries`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
