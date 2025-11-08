import { readdir, readFile, writeFile, mkdir, cp, stat } from "node:fs/promises";
import { join, relative, sep, dirname, basename } from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();

// Сканируем оба корня, но будем жёстко дедуплицировать
const CONTENT_DIRS = [
  join(ROOT, "content"),           // приоритет 0 (основной контент)
  join(ROOT, "content", "models"), // приоритет 1 (наследие)
];

// registry.json — источник моделей/карты (может отсутствовать)
const REGISTRY_FILE = join(ROOT, "content", "models", "registry.json");

const PUBLIC   = join(ROOT, "public");
const SRC_DATA = join(ROOT, "src", "data");

const ERA_DIRS = new Set(["current", "pre-rector", "pre-borders"]);

const SING2PL = {
  character: "characters",
  object: "objects",
  place: "places",
  protocol: "protocols",
  event: "events",
  document: "documents",
  hybrid: "hybrid",
};
const PLURALS = new Set(Object.values(SING2PL));

const ensureDir = async (p) => mkdir(p, { recursive: true });
const tryStat   = async (p) => { try { return await stat(p); } catch { return null; } };

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
      а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"yo", ж:"zh", з:"z", и:"i", й:"j",
      к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f",
      х:"h", ц:"c", ч:"ch", ш:"sh", щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya"
    };
    return map[c] ?? "";
  });

const slugify = (s) => {
  const base  = String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const ascii = /[A-Za-z0-9]/.test(base) ? base : translitRu(base);
  return ascii.toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};
const sha1 = (s) => createHash("sha1").update(String(s)).digest("hex");

const singular = (t) => {
  if (!t) return "";
  for (const [s, p] of Object.entries(SING2PL)) if (t.toLowerCase() === p) return s;
  return t.endsWith("s") ? t.slice(0, -1) : t;
};
const toPlural = (t) => {
  if (!t) return "hybrid";
  const low = String(t).toLowerCase();
  if (PLURALS.has(low)) return low;
  return SING2PL[low] || "hybrid";
};

const branchAndTypeFromPath = (absFile) => {
  const posix = absFile.split(sep).join("/");
  const m = posix.match(/\/content\/(?:models\/)?(current|pre-rector|pre-borders)\/([^/]+)\//);
  const branch = m?.[1] ?? "current";
  const group  = m?.[2] ?? "entries";
  return { branch, type: PLURALS.has(group) ? group : toPlural(group) };
};

const canonicalBranch = (raw, fb) => (ERA_DIRS.has(raw) ? raw : fb);

const normalizeAuthors = (authors) =>
  Array.isArray(authors)
    ? authors.map((a) => (typeof a === "string" ? { name: a } : { name: a.name ?? "", role: a.role ?? "" }))
    : [];

const safeReadJSON = async (file) => {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (e) { throw new Error(`[index] JSON parse error at ${file}: ${e.message}`); }
};

const writeJSON = async (p, obj) => {
  await ensureDir(dirname(p));
  await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
};

const originRank = (absPath) => {
  // content/ = 0 (предпочтительно), content/models = 1
  return /\/content\/models\//.test(absPath.split(sep).join("/")) ? 1 : 0;
};

const main = async () => {
  // registry (не обязателен)
  let registry = {};
  try { registry = await safeReadJSON(REGISTRY_FILE); } catch {}

  // собираем кандидатов из обоих корней
  const allFiles = (await Promise.all(CONTENT_DIRS.map((d) => walkMetaFiles(d)))).flat();

  // ДЕДУПЛИКАЦИЯ: ключ = branch/type/slug, при конфликте берём меньший originRank (т.е. prefer content/)
  const chosen = new Map(); // key -> { path, branch, type(plural), raw, meta }
  const warnings = [];

  for (const f of allFiles) {
    const raw = await safeReadJSON(f);

    const parsed = branchAndTypeFromPath(f);
    const branch = canonicalBranch(raw.branch || raw.era, parsed.branch);
    const type   = toPlural(raw.group || raw.type || parsed.type);

    const baseSlug = raw.slug || raw.id || raw.name || raw.title || basename(f).replace(/\.meta\.json$/,"");
    const slug = slugify(baseSlug) || slugify(sha1(f).slice(0, 8));

    const key = `${branch}/${type}/${slug}`;
    const candRank = originRank(f);

    if (chosen.has(key)) {
      const prev = chosen.get(key);
      // одинаковый entity_id → оставляем предпочтительный источник
      const prevId = prev.raw?.entity_id || prev.raw?.id || "";
      const candId = raw?.entity_id || raw?.id || "";
      if (candRank < prev.rank) {
        chosen.set(key, { path: f, rank: candRank, branch, type, slug, raw });
      } else {
        // сохраняем старый, этот пропускаем
      }
      // если разные entity_id под одним slug — предупреждение
      if (prevId && candId && prevId !== candId) {
        warnings.push(`[index] slug collision with different IDs for ${key}: ${prev.path} vs ${f}`);
      }
      continue;
    }
    chosen.set(key, { path: f, rank: candRank, branch, type, slug, raw });
  }

  // Собираем итоговые entries
  const entries = [];
  for (const [key, v] of chosen.entries()) {
    const { branch, type, slug, raw } = v;

    const entity_id =
      raw.entity_id || raw.id || sha1(`${branch}/${type}/${slug}:${raw.name ?? raw.title ?? ""}`);

    const meta = {
      entity_id,
      type: singular(raw.type || type),  // singular для модели
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
      if (!meta[k] && meta[k] !== 0) warnings.push(`[index] missing ${k} for ${key}`);
    }

    entries.push({ branch, type, meta });
  }

  // стабильная сортировка
  entries.sort((a, b) =>
    a.branch === b.branch
      ? a.type === b.type
        ? a.meta.title.localeCompare(b.meta.title, "ru")
        : a.type.localeCompare(b.type, "en")
      : a.branch.localeCompare(b.branch, "en")
  );

  // ветки → типы
  const branchesMap = new Map();
  for (const e of entries) {
    if (!branchesMap.has(e.branch)) branchesMap.set(e.branch, new Set());
    branchesMap.get(e.branch).add(e.type);
  }
  const branches = [...branchesMap.entries()].map(([name, set]) => ({
    name,
    types: [...set].sort(),
  }));

  const indexObj = {
    generatedAt: new Date().toISOString(),
    branches,
    count: entries.length,
    entries,
  };

  // вывод
  await ensureDir(PUBLIC);
  await ensureDir(SRC_DATA);
  await ensureDir(join(PUBLIC, "models"));
  await ensureDir(join(SRC_DATA, "models"));

  await writeJSON(join(PUBLIC, "index.json"), indexObj);
  await writeJSON(join(SRC_DATA, "index.json"), indexObj);

  for (const { name: branch } of branches) {
    const types = branchesMap.get(branch) || new Set();
    for (const t of types) {
      const scoped = entries.filter((e) => e.branch === branch && e.type === t);
      const list = scoped.map((e) => ({ slug: e.meta.slug, title: e.meta.title }));
      const mapSlugToId = Object.fromEntries(scoped.map((e) => [e.meta.slug, e.meta.entity_id]));

      const pubTypePath = join(PUBLIC,   "b", branch, "e", t);
      const dataTypePath = join(SRC_DATA, "b", branch, "e", t);

      await writeJSON(join(pubTypePath,  "list.json"), list);
      await writeJSON(join(pubTypePath,  "map.json"),  mapSlugToId);
      await writeJSON(join(dataTypePath, "list.json"), list);
      await writeJSON(join(dataTypePath, "map.json"),  mapSlugToId);

      for (const e of scoped) {
        await writeJSON(join(pubTypePath,  `${e.meta.slug}.meta.json`), e.meta);
        await writeJSON(join(dataTypePath, `${e.meta.slug}.meta.json`), e.meta);
      }
    }
  }

  // registry.json — мягко
  try {
    await cp(REGISTRY_FILE, join(PUBLIC,   "models", "registry.json"));
    await cp(REGISTRY_FILE, join(SRC_DATA, "models", "registry.json"));
  } catch (e) {
    console.warn(`[index] cannot copy registry.json: ${e.message}`);
  }

  // map config
  const mapCfg = (registry && registry.map) ? registry.map : {};
  await ensureDir(join(SRC_DATA, "map"));
  await ensureDir(join(PUBLIC,   "map"));
  await writeJSON(join(SRC_DATA, "map", "config.json"), mapCfg);
  await writeJSON(join(PUBLIC,   "map", "config.json"), mapCfg);

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
