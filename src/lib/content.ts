// универсальный лоадер карточек и реестра

export type CardMeta = {
  slug: string;
  title: string;
  subtitle?: string;
  type: "character"|"object"|"place"|"protocol"|"event"|"document"|"hybrid"|string;
  branch?: string;                 // "current" | "pre-borders" | ...
  param_bindings?: Record<string, number>;
  tags?: string[];
  updated_at?: string;
  map?: { image?: string };
  [k: string]: any;
};

export type Registry = {
  models?: Record<string, any>;
  locks?: Record<string, any>;
  eligibility?: Record<string, any>;
  map?: any;
  thresholds?: Record<string, any>;
};

const globMeta = import.meta.glob("/content/cards/**/*.meta.json", { eager: true, import: "default" });
const globData = import.meta.glob("/content/cards/**/*.data.json", { eager: true, import: "default" }); // опционально

// /content/models/<branch>/registry.json, фоллбэк на current
const registries = import.meta.glob("/content/models/*/registry.json", { eager: true, import: "default" });

function pathToSlug(p: string) {
  // /content/cards/<...>/<slug>.meta.json  -> <slug>
  const base = p.split("/").pop() || "";
  return base.replace(/\.meta\.json$/,"");
}

function pickBranchFromPath(p: string): string | undefined {
  // допускаем структуру /content/cards/<branch>/.../*.meta.json
  const parts = p.split("/");
  const idx = parts.indexOf("cards");
  if (idx >= 0 && parts.length > idx+2) {
    // cards / <maybe-branch> / ...
    const maybe = parts[idx+1];
    // если похоже на ветку
    if (["current","pre-borders","pre-rector"].includes(maybe)) return maybe;
  }
  return undefined;
}

export function loadCards() {
  const byKey: Record<string, CardMeta> = {};
  for (const [path, val] of Object.entries(globMeta) as any) {
    const meta = val as CardMeta;
    // slug: из файла, иначе из имени файла
    const slug = meta.slug || pathToSlug(path);
    const branch = meta.branch || pickBranchFromPath(path) || "current";
    byKey[`${branch}:${slug}`] = { slug, branch, ...meta };
  }
  // подшиваем .data.json рядом, если есть
  for (const [path, val] of Object.entries(globData) as any) {
    const slug = pathToSlug(path.replace(/\.data\.json$/, ".meta.json"));
    const branch = pickBranchFromPath(path) || "current";
    const key = `${branch}:${slug}`;
    if (byKey[key]) (byKey[key] as any).data = val;
  }
  return Object.values(byKey);
}

export function loadCardsByBranch(branch: string) {
  return loadCards().filter(c => (c.branch || "current") === branch);
}

export function loadRegistry(branch: string): Registry {
  // ищем идеальный матч, затем current, затем первый попавшийся
  const byBranch: Record<string, Registry> = {};
  for (const [path, val] of Object.entries(registries) as any) {
    const b = path.split("/").slice(-2)[0]; // models/<branch>/registry.json
    byBranch[b] = val as Registry;
  }
  return byBranch[branch] || byBranch["current"] || {};
}
