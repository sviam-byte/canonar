// src/lib/content.ts
// Универсальный лоадер карточек и реестра: ест и /content/cards/**, и /content/<branch>/<group>/**

export type CardMeta = {
  slug: string;
  title: string;
  subtitle?: string;
  // type — сингуляр ("place"|"object"|...), group — папочный множественный ("places"|"objects"|...)
  type?: string;
  group?: string;
  branch?: "current" | "pre-borders" | "pre-rector" | string;
  param_bindings?: Record<string, number>;
  tags?: string[];
  updated_at?: string;
  [k: string]: any;
};

export type Registry = {
  models?: Record<string, any>;
  locks?: Record<string, any>;
  eligibility?: Record<string, any>;
  map?: any;
  thresholds?: Record<string, any>;
};

const BRANCHES = ["current", "pre-borders", "pre-rector"] as const;
const SING_BY_GROUP: Record<string, string> = {
  characters: "character",
  objects: "object",
  places: "place",
  protocols: "protocol",
  events: "event",
  documents: "document",
  hybrid: "hybrid",
};

// 1) БЕРЁМ всё .meta в /content/**, не только /content/cards/**
const globMeta = import.meta.glob("/content/**/*.meta.json", {
  eager: true,
  import: "default",
});
const globData = import.meta.glob("/content/**/*.data.json", {
  eager: true,
  import: "default",
});

// 2) Реестры моделей: /content/models/<branch>/registry.json
const registries = import.meta.glob("/content/models/*/registry.json", {
  eager: true,
  import: "default",
});

// ---------- helpers ----------

function pathToSlug(p: string) {
  const base = p.split("/").pop() || "";
  return base.replace(/\.meta\.json$/, "");
}

function pickBranchFromPath(p: string): string | undefined {
  // матч ветки в обоих вариантах путей: /content/(cards/)?<branch>/
  const m = p.match(/\/content\/(?:cards\/)?(current|pre-borders|pre-rector)\//);
  return m?.[1];
}

function pickGroupFromPath(p: string): string | undefined {
  // вынимаем group (places|objects|...) сразу после ветки
  const m = p.match(
    /\/content\/(?:cards\/)?(?:current|pre-borders|pre-rector)\/([^/]+)\//
  );
  return m?.[1]?.toLowerCase();
}

// ---------- API ----------

export function loadCards(): CardMeta[] {
  const byKey: Record<string, CardMeta> = {};

  // .meta.json
  for (const [path, val] of Object.entries(globMeta) as any) {
    // Игнорим все под /content/models/**
    if (path.includes("/content/models/")) continue;

    const meta = val as CardMeta;
    const slug = meta.slug || pathToSlug(path);
    const branch =
      (meta.branch || pickBranchFromPath(path) || "current") as CardMeta["branch"];
    const group = (meta.group || pickGroupFromPath(path) || "").toLowerCase();

    // Определяем сингулярный type:
    const typeSing = (meta.type || SING_BY_GROUP[group] || "hybrid").toLowerCase();

    const key = `${branch}:${group}:${slug}`;
    byKey[key] = {
      slug,
      branch,
      group,
      type: typeSing,
      ...meta,
    };
  }

  // .data.json рядом (опционально)
  for (const [path, val] of Object.entries(globData) as any) {
    if (path.includes("/content/models/")) continue;
    const metaPathGuess = path.replace(/\.data\.json$/, ".meta.json");
    const slug = pathToSlug(metaPathGuess);
    const branch = pickBranchFromPath(path) || "current";
    const group = pickGroupFromPath(path) || "";
    const key = `${branch}:${group}:${slug}`;
    if (byKey[key]) (byKey[key] as any).data = val;
  }

  return Object.values(byKey);
}

export function loadCardsByBranch(branch: string) {
  return loadCards().filter((c) => (c.branch || "current") === branch);
}

export function loadCardsByBranchAndGroup(branch: string, group: string) {
  const g = group.toLowerCase();
  return loadCards().filter(
    (c) => (c.branch || "current") === branch && (c.group || "") === g
  );
}

export function loadRegistry(branch: string): Registry {
  const byBranch: Record<string, Registry> = {};
  for (const [path, val] of Object.entries(registries) as any) {
    const b = path.split("/").slice(-2)[0]; // models/<branch>/registry.json
    byBranch[b] = val as Registry;
  }
  return byBranch[branch] || byBranch["current"] || {};
}
