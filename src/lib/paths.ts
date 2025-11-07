// src/lib/paths.ts
type CanonEntry = {
  branch: string;
  type: "characters"|"objects"|"places"|"protocols"|"events"|"documents"|string;
  slug: string;
};

type CanonIndex = {
  entries: CanonEntry[];
};

/** Пытаемся загрузить сгенерированный индекс.
 *  План A: src/data/index.json (пишется скриптом build-index.mjs)
 *  План B: content/index.json (если ты туда пишешь)
 *  План Z: вернуть демо-набор путей, чтобы билд не падал.
 */
export async function loadPaths(): Promise<CanonEntry[]> {
  // A: src/data/index.json
  try {
    const mod = await import("@/data/index.json", { assert: { type: "json" } } as any);
    const idx = (mod.default ?? mod) as CanonIndex | CanonEntry[];
    if (Array.isArray(idx)) return idx as CanonEntry[];
    if (idx && Array.isArray(idx.entries)) return idx.entries;
  } catch {/* noop */ }

  // B: content/index.json
  try {
    const mod = await import("@/content/index.json", { assert: { type: "json" } } as any);
    const idx = (mod.default ?? mod) as CanonIndex | CanonEntry[];
    if (Array.isArray(idx)) return idx as CanonEntry[];
    if (idx && Array.isArray(idx.entries)) return idx.entries;
  } catch {/* noop */ }

  // Z: демо-пути, чтобы сборка не падала
  return [
    { branch: "current", type: "objects",    slug: "o2-router-x1" },
    { branch: "current", type: "characters", slug: "einarr" },
    { branch: "current", type: "places",     slug: "sector-d7" },
    { branch: "current", type: "protocols",  slug: "quarantine-72h" },
    { branch: "current", type: "events",     slug: "leak-incident-a12" },
    { branch: "current", type: "documents",  slug: "whitepaper-o2-pipeline" },
  ];
}
