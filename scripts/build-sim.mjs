import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const CONTENT = join(ROOT, "content", "sim");
const SRC_DATA = join(ROOT, "src", "data", "sim");

const ensureDir = async (p) => mkdir(p, { recursive: true });

async function safeJSON(p) { return JSON.parse(await readFile(p, "utf8")); }

async function walk(dir, pred) {
  const out = [];
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p, pred));
    else if (e.isFile() && pred(e.name)) out.push(p);
  }
  return out;
}

function brSlugFromPath(abs) {
  const rel = relative(CONTENT, abs).split(sep);
  const branch = rel[0] || "current";
  const slug = (rel[1] || "").replace(/\.meta\.json$/,"");
  return { branch, slug };
}

async function main() {
  const files = await walk(CONTENT, (n) => n.endsWith(".meta.json")).catch(()=>[]);
  const outIndex = [];

  // подхват per-entity меты (из build-index)
  const loadMeta = async (branch, type, slug) => {
    const p = join(ROOT, "src", "data", "b", branch, "e", type, `${slug}.meta.json`);
    return await safeJSON(p);
    // если не найдёт — пусть падает, чтобы было видно проблему ссылок
  };

  for (const f of files) {
    const raw = await safeJSON(f);
    const { branch, slug } = brSlugFromPath(f);

    let entity = raw.entity;
    if (!entity && raw.entityRef) {
      const { type, slug: eslug } = raw.entityRef;
      entity = await loadMeta(branch, type, eslug);
    }

    const built = {
      branch, slug,
      title: raw.title || slug,
      description: raw.description || "",
      entity: { type: entity.type, model_ref: entity.model_ref || entity.type, param_bindings: entity.param_bindings || {} },
      days: raw.days ?? 30,
      interventions: raw.interventions || []
    };

    await ensureDir(join(SRC_DATA, "b", branch));
    await writeFile(join(SRC_DATA, "b", branch, `${slug}.json`), JSON.stringify(built, null, 2), "utf8");
    outIndex.push({ branch, slug, title: built.title });
  }

  await writeFile(join(SRC_DATA, "index.json"), JSON.stringify(outIndex, null, 2), "utf8");
  console.log(`[sim] built ${outIndex.length} scenarios`);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
