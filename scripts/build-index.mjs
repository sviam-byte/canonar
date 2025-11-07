import { readdir, readFile, writeFile, mkdir, cp, stat } from "node:fs/promises";
import { join, relative, sep, dirname, basename } from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const CONTENT_DIRS = [
  join(ROOT, "content", "models"), // прежний путь
  join(ROOT, "content")            // обычный контент
];
const REGISTRY_FILE = join(ROOT, "content", "models", "registry.json"); // источник registry
const PUBLIC = join(ROOT, "public");
const SRC_DATA = join(ROOT, "src", "data");

// Ветки лора
const ERA_DIRS = new Set(["current", "pre-rector", "pre-borders"]);

// Маппинг к множественному числу для URL-сегмента e/<type>
const SING2PL = {
  character: "characters",
  object: "objects",
  place: "places",
  protocol: "protocols",
  event: "events",
  document: "documents",
  hybrid: "hybrid"
};
const PL_SET = new Set(Object.values(SING2PL));

const ensureDir = async (p) => mkdir(p, { recursive: true });

const tryStat = async (p) => {
  try { return await stat(p); } catch { return null; }
};

const walkFiles = async (dir, pred) => {
  const out = [];
  const st = await tryStat(dir);
  if (!st || !st.isDirectory()) return out;
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(p, pred)));
    else if (e.isFile() && pred(e.name)) out.push(p);
  }
  return out;
};
const walkMetaFiles = (dir) => walkFiles(dir, (n) => n.endsWith(".meta.json"));

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
const sha1 = (s) => createHash("sha1").update(String(s)).digest("hex");

const singular = (t) => {
  if (!t) return "";
  // если прислали уже plural, верни приблизительное singular
  for (const [s, p] of Object.entries(SING2PL)) if (t === p) return s;
  // грубый срез "s" в конце — как fallback
  return t.endsWith("s") ? t.slice(0, -1) : t;
};

const toPluralType = (rawType) => {
  if (!rawType) return "hybrid";
  const low = String(rawType).toLowerCase();
  if (PL_SET.has(low)) return low;
  return SING2PL[low] || "hybrid";
};

// Универсальный парсер branch/type из абсолютного файла, допускает оба корня.
const branchAndTypeFromPath = (absFile) => {
  // Нормализуем к POSIX
  const posix = absFile.split(sep).join("/");
  // Ищем .../content/(models/)?<branch>/<type>/...
  const m = posix.match(/\/content\/(?:models\/)?(current|pre-rector|pre-borders)\/([^/]+)\//);
  const branch = m?.[1] ?? "current";
  const maybeGroup = m?.[2] ?? "entries";
  const typePlural = PL_SET.has(maybeGroup) ? maybeGroup : toPluralType(maybeGroup);
  return { branch, type: typePlural };
};

const canonicalBranch = (raw, fallback) => (ERA_DIRS.has(raw) ? raw : fallback);

const normalizeAuthors = (authors) =>
  Array.isArray(authors)
    ? authors.map((a) =>
        typeof a === "string" ? { name: a } : { name: a.name ?? "", role: a.role ?? "" }
      )
    : [];

const ensureUniqueSlugFactory = () => {
  const perScope = new Map(); // key = branch/type -> Map(slug->count)
  return (branch, type, slug) => {
    const scope = `${branch}/${type}`;
    if (!perScope.has(scope)) perScope.set(scope, new Map());
    const m = perScope.get(scope);
    if (!m.has(slug)) { m.set(slug, 1); return slug; }
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

const writeJsonPretty = async (p, obj) => {
  await ensureDir(dirname(p));
  await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
};

const main = async () => {
  // 1) registry.json (может отсутствовать на раннем этапе)
  let registry = {};
  try {
    registry = await safeReadJSON(REGISTRY_FILE);
  } catch {
    // ok, без registry переживём
    registry = {};
  }

  // 2) собираем все *.meta.json из обоих корней
  const metaFilesArrays = await Promise.all(CONTENT_DIRS.map((d) => walkMetaFiles(d)));
  const metaFiles = metaFilesArrays.flat();

  const dedupeSlug = ensureUniqueSlugFactory();
  const entries = [];
  const warnings = [];

  for (const f of metaFiles) {
    const raw = await safeReadJSON(f);

    // ветка: meta.branch|meta.era|path
    const parsed = branchAndTypeFromPath(f);
    const branch = canonicalBranch(raw.branch || raw.era, parsed.branch);

    // тип-группа: meta.group|meta.type|path, НОРМАЛИЗУЕМ к plural
    const fromMetaGroup = raw.group ? toPluralType(raw.group) : null;
    const fromMetaType  = raw.type  ? toPluralType(raw.type)  : null;
    const type = fromMetaGroup || fromMetaType || parsed.type; // уже plural

    // slug
    const baseSlug = raw.slug || raw.id || raw.name || raw.title || basename(f).replace(/\.meta\.json$/,"");
    let slug = slugify(baseSlug) || slugify(sha1(f).slice(0, 8));
    slug = dedupeSlug(branch, type, slug);

    // стабильный entity_id
    const entity_id =
      raw.entity_id || raw.id || sha1(`${branch}/${type}/${slug}:${raw.name ?? raw.title ?? ""}`);

    const meta = {
      entity_id,
      type: singular(raw.type || type),      // для моделей храним singular
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
      param_hints: raw.param_hints || {},
      param_docs: raw.param_docs || {},
      param_locked: Array.isArray(raw.param_locked) ? raw.param_locked : [],
      coords: raw.coords || null,
      notes: raw.notes || "",
      changelog: Array.isArray(raw.changelog) ? raw.changelog : [],
      branch
    };

    for (const k of ["entity_id", "type", "slug", "title"]) {
      if (!meta[k] && meta[k] !== 0) warnings.push(`[index] ${f}: missing ${k}`);
    }

    entries.push({ branch, type, meta });
  }

  // 3) сортировка
  entries.sort((a, b) =>
    a.branch === b.branch
      ? a.type === b.type
        ? a.meta.title.localeCompare(b.meta.title, "ru")
        : a.type.localeCompare(b.type, "en")
      : a.branch.localeCompare(b.branch, "en")
  );

  // 4) ветка → набор типов
  const branchesMap = new Map();
  for (const e of entries) {
    if (!branchesMap.has(e.branch)) branchesMap.set(e.branch, new Set());
    branchesMap.get(e.branch).add(e.type); // plural
  }
  const branches = [...branchesMap.entries()].map(([name, set]) => ({
    name,
    types: [...set].sort()
  }));

  const indexObj = {
    generatedAt: new Date().toISOString(),
    branches,
    count: entries.length,
    entries // [{branch, type(plural), meta}]
  };

  // 5) вывод
  await ensureDir(PUBLIC);
  await ensureDir(SRC_DATA);
  await ensureDir(join(PUBLIC, "models"));
  await ensureDir(join(SRC_DATA, "models"));

  await writeJsonPretty(join(PUBLIC, "index.json"), indexObj);
  await writeJsonPretty(join(SRC_DATA, "index.json"), indexObj);

  // списки, карты, per-entity meta
  for (const { name: branch } of branches) {
    const types = branchesMap.get(branch) || new Set();
    for (const t of types) {
      const scoped = entries.filter((e) => e.branch === branch && e.type === t);
      const list = scoped.map((e) => ({ slug: e.meta.slug, title: e.meta.title }));
      const mapSlugToId = Object.fromEntries(scoped.map((e) => [e.meta.slug, e.meta.entity_id]));

      const pubTypePath = join(PUBLIC, "b", branch, "e", t);
      const dataTypePath = join(SRC_DATA, "b", branch, "e", t);

      await writeJsonPretty(join(pubTypePath, "list.json"), list);
      await writeJsonPretty(join(pubTypePath, "map.json"), mapSlugToId);
      await writeJsonPretty(join(dataTypePath, "list.json"), list);
      await writeJsonPretty(join(dataTypePath, "map.json"), mapSlugToId);

      for (const e of scoped) {
        await writeJsonPretty(join(pubTypePath, `${e.meta.slug}.meta.json`), e.meta);
        await writeJsonPretty(join(dataTypePath, `${e.meta.slug}.meta.json`), e.meta);
      }
    }
  }

  // registry.json → public/src (если есть)
  try {
    await cp(REGISTRY_FILE, join(PUBLIC, "models", "registry.json"));
    await cp(REGISTRY_FILE, join(SRC_DATA, "models", "registry.json"));
  } catch (e) {
    console.warn(`[index] cannot copy registry.json: ${e.message}`);
  }

  // map config (если есть)
  const mapCfg = (registry && registry.map) ? registry.map : {};
  await ensureDir(join(SRC_DATA, "map"));
  await ensureDir(join(PUBLIC, "map"));
  await writeJsonPretty(join(SRC_DATA, "map", "config.json"), mapCfg);
  await writeJsonPretty(join(PUBLIC, "map", "config.json"), mapCfg);

  // предупреждения: заблокированный параметр существует в модели
  const modelDefs = (registry && registry.models) ? registry.models : {};
  for (const e of entries) {
    const defs = modelDefs[e.meta.model_ref] || modelDefs[e.meta.type] || {};
    const params = defs.params || {};
    for (const lk of e.meta.param_locked || []) {
      if (!(lk in params)) {
        warnings.push(`[index] ${e.meta.slug}: locked "${lk}" not in model "${e.meta.model_ref}"`);
      }
    }
  }

  // отчёт
  const countBy = Object.fromEntries(
    [...branchesMap.keys()].map((b) => [
      b,
      Object.fromEntries(
        [...(branchesMap.get(b) || new Set())].map((t) => [
          t, entries.filter((e) => e.branch === b && e.type === t).length
        ])
      )
    ])
  );
  if (warnings.length) warnings.forEach((w) => console.warn(w));
  console.log(`[canonAR] Wrote index + lists + maps + per-entity meta: ${entries.length} entries`);
  console.log(`[canonAR] counts: ${JSON.stringify(countBy)}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
