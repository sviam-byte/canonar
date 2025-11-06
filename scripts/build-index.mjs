import { readdir, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const CONTENT = join(ROOT, "content", "models");
const PUBLIC = join(ROOT, "public");
const SRC_DATA = join(ROOT, "src", "data");
const ERA_DIRS = new Set(["current", "pre-rector", "pre-borders"]);

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

const translitRu = (s) =>
  s.replace(/[А-ЯЁ]/g, (c) => c.toLowerCase()).replace(/[а-яё]/g, (c) => {
    const map = {
      а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
      з: "z", и: "i", й: "j", к: "k", л: "l", м: "m", н: "n", о: "o",
      п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
      ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
    };
    return map[c] ?? "";
  });

const slugify = (s) => {
  const base = String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const ascii = /[A-Za-z0-9]/.test(base) ? base : translitRu(base);
  return ascii
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const singular = (t) => (t.endsWith("s") ? t.slice(0, -1) : t);

const branchAndTypeFromPath = (absFile) => {
  const rel = relative(CONTENT, absFile).split(sep);
  const idx = rel.findIndex((p) => ERA_DIRS.has(p));
  const branch = idx >= 0 ? rel[idx] : "current";
  const type = idx >= 0 && rel[idx + 1] ? rel[idx + 1] : "entries";
  return { branch, type };
};

const canonicalBranch = (rawEra, fallback) => (ERA_DIRS.has(rawEra) ? rawEra : fallback);
const sha1 = (s) => createHash("sha1").update(String(s)).digest("hex");

const normalizeAuthors = (authors) =>
  Array.isArray(authors)
    ? authors.map((a) =>
        typeof a === "string" ? { name: a } : { name: a.name ?? "", role: a.role ?? "" }
      )
    : [];

const ensureUniqueSlugFactory = () => {
  const perScope = new Map();
  return (branch, type, slug) => {
    const scope = `${branch}/${type}`;
    if (!perScope.has(scope)) perScope.set(scope, new Map());
    const m = perScope.get(scope);
    if (!m.has(slug)) {
      m.set(slug, 1);
      return slug;
    }
    const n = m.get(slug) + 1;
    m.set(slug, n);
    return `${slug}-${n}`;
  };
};

const safeReadJSON = async (file) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    throw new Error(`[index] JSON parse error at ${file}: ${e.message}`);
  }
};

const main = async () => {
  const registryPath = join(CONTENT, "registry.json");
  const metaFiles = await walkMetaFiles(CONTENT);
  const dedupeSlug = ensureUniqueSlugFactory();

  const entries = [];
  const warnings = [];

  for (const f of metaFiles) {
    const raw = await safeReadJSON(f);
    const fromPath = branchAndTypeFromPath(f);
    const branch = canonicalBranch(raw.era, fromPath.branch);
    const type = fromPath.type;

    const baseSlug = raw.slug || raw.id || raw.name || raw.title || f;
    let slug = slugify(baseSlug);
    if (!slug) slug = slugify(sha1(f).slice(0, 8));
    slug = dedupeSlug(branch, type, slug);

    const entity_id =
      raw.entity_id || raw.id || sha1(`${branch}/${type}/${slug}:${raw.name ?? raw.title ?? ""}`);

    const meta = {
      entity_id,
      type: singular(type),
      slug,
      title: raw.name || raw.title || slug,
      subtitle: raw.title && raw.name ? raw.title : raw.subtitle || "",
      status: raw.status || "draft",
      tags: raw.tags || raw.traits || [],
      version_tags: Array.isArray(raw.version_tags) ? raw.version_tags : [],
      authors: normalizeAuthors(raw.authors),
      relations: Array.isArray(raw.relations) ? raw.relations : [],
      media: {
        images: Array.isArray(raw.images) ? raw.images : [],
        audio: Array.isArray(raw.audio) ? raw.audio : [],
        video: Array.isArray(raw.video) ? raw.video : []
      },
      model_ref: raw.model_ref || singular(type),
      param_bindings: raw.param_bindings || {},
      notes: raw.notes || "",
      changelog: Array.isArray(raw.changelog) ? raw.changelog : []
    };

    for (const k of ["entity_id", "type", "slug", "title"]) {
      if (!meta[k] && meta[k] !== 0) warnings.push(`[index] ${f}: missing ${k}`);
    }

    entries.push({ branch, type, meta });
  }

  entries.sort((a, b) =>
    a.branch === b.branch
      ? a.type === b.type
        ? a.meta.title.localeCompare(b.meta.title, "en")
        : a.type.localeCompare(b.type, "en")
      : a.branch.localeCompare(b.branch, "en")
  );

  const branchesMap = new Map();
  for (const e of entries) {
    if (!branchesMap.has(e.branch)) branchesMap.set(e.branch, new Set());
    branchesMap.get(e.branch).add(e.type);
  }
  const branches = [...branchesMap.entries()].map(([name, set]) => ({
    name,
    types: [...set].sort()
  }));

  const indexObj = {
    generatedAt: new Date().toISOString(),
    branches,
    count: entries.length,
    entries
  };

  await ensureDir(PUBLIC);
  await ensureDir(SRC_DATA);
  await ensureDir(join(PUBLIC, "models"));
  await ensureDir(join(SRC_DATA, "models"));

  await writeFile(join(PUBLIC, "index.json"), JSON.stringify(indexObj, null, 2), "utf8");
  await writeFile(join(SRC_DATA, "index.json"), JSON.stringify(indexObj, null, 2), "utf8");

  for (const { name: branch } of branches) {
    const types = branchesMap.get(branch);
    for (const t of types) {
      const scoped = entries.filter((e) => e.branch === branch && e.type === t);

      const list = scoped.map((e) => ({ slug: e.meta.slug, title: e.meta.title }));
      const mapSlugToId = Object.fromEntries(scoped.map((e) => [e.meta.slug, e.meta.entity_id]));

      const pubTypePath = join(PUBLIC, "b", branch, "e", t);
      const dataTypePath = join(SRC_DATA, "b", branch, "e", t);
      await ensureDir(pubTypePath);
      await ensureDir(dataTypePath);

      await writeFile(join(pubTypePath, `list.json`), JSON.stringify(list, null, 2), "utf8");
      await writeFile(join(dataTypePath, `list.json`), JSON.stringify(list, null, 2), "utf8");

      await writeFile(join(pubTypePath, `map.json`), JSON.stringify(mapSlugToId, null, 2), "utf8");
      await writeFile(join(dataTypePath, `map.json`), JSON.stringify(mapSlugToId, null, 2), "utf8");

      for (const e of scoped) {
        const pubEntityPath = join(pubTypePath, `${e.meta.slug}.meta.json`);
        const dataEntityPath = join(dataTypePath, `${e.meta.slug}.meta.json`);
        await writeFile(pubEntityPath, JSON.stringify(e.meta, null, 2), "utf8");
        await writeFile(dataEntityPath, JSON.stringify(e.meta, null, 2), "utf8");
      }
    }
  }

  try {
    await cp(join(CONTENT, "registry.json"), join(PUBLIC, "models", "registry.json"));
    await cp(join(CONTENT, "registry.json"), join(SRC_DATA, "models", "registry.json"));
  } catch (e) {
    warnings.push(`[index] cannot copy registry.json: ${e.message}`);
  }

  if (warnings.length) warnings.forEach((w) => console.warn(w));
  console.log(`[canonAR] Wrote index + lists + maps + per-entity meta: ${entries.length} entries`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
