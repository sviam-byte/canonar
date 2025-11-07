// src/lib/paths.ts
type CanonEntry = {
  branch: string;
  type:
    | "characters" | "objects" | "places" | "protocols" | "events" | "documents"
    | (string & {});
  slug: string;
};

type CanonIndex = { entries: CanonEntry[] };

/** Пытаемся загрузить индекс путей «по-доброковому».
 *  A: src/data/index.json (генерится скриптом)
 *  B: content/index.json (если так удобнее)
 *  Z: демо-набор, чтобы билд всегда проходил.
 */
export async function loadPaths(): Promise<CanonEntry[]> {
  // Используем import.meta.glob, чтобы отсутствие файла не роняло сборку
  const globAny = import.meta.glob("/src/**/index.json", { eager: true });

  const prefer = ["/src/data/index.json", "/src/content/index.json", "/src/index.json"];
  for (const key of prefer) {
    const mod = globAny[key] as any;
    if (mod) {
      const data = mod.default ?? mod;
      if (Array.isArray(data)) return data as CanonEntry[];
      if (data && Array.isArray((data as CanonIndex).entries)) return (data as CanonIndex).entries;
    }
  }

  // План Z
  return [
    { branch: "current", type: "objects",    slug: "o2-router-x1" },
    { branch: "current", type: "characters", slug: "einarr" },
    { branch: "current", type: "places",     slug: "sector-d7" },
    { branch: "current", type: "protocols",  slug: "quarantine-72h" },
    { branch: "current", type: "events",     slug: "leak-incident-a12" },
    { branch: "current", type: "documents",  slug: "whitepaper-o2-pipeline" },
  ];
}
