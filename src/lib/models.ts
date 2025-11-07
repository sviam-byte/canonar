// src/lib/models.ts
import {
  clamp,
  computeDose,
  computePvObject,
  computeVsigmaObject,
  computeDriftObject,
  computeStability,
  computeInfluenceCharacter,
  computeMonstroPr,
  computePvCharacter,
  computeVsigmaCharacter,
  computeDriftCharacter,
} from "./metrics";

/* ── типы ── */
export type BranchT = 'pre-borders' | 'pre-rector' | 'current';

export type ParamDef = { min: number; max: number; step?: number; label?: string };
export type ModelDef = { params: Record<string, ParamDef>; extends?: string };
export type LocksDef = Record<string, Record<string, { locked: boolean; reason?: string }>>;
export type EligibilityCfg = Record<string, any>;
export type MapCfg = { image?: string; bounds?: [number, number, number, number] };

export type RegistryT = {
  models?: Record<string, ModelDef>;
  locks?: LocksDef;
  eligibility?: EligibilityCfg;
  map?: MapCfg;

  // ── расширения (необязательные) — не ломают старый код
  branch?: BranchT;
  thresholds?: {
    blackstart?: number; // Vσ*
    monstro?: number;    // порог «монстра»
  };
  j_profile?: 'strict'|'moderate'|'wide';
};

/* ── resolve extends/hybrid ── */
function resolveExtends(reg: RegistryT, key?: string): Record<string, ParamDef> {
  if (!key || !reg?.models?.[key]) return {};
  const seen = new Set<string>();
  const dfs = (k: string): Record<string, ParamDef> => {
    if (seen.has(k)) return {};
    seen.add(k);
    const md = reg.models![k];
    const base = md.extends ? dfs(md.extends) : {};
    return { ...base, ...(md.params || {}) };
  };
  return dfs(key);
}

/** безопасная середина, если нет дефолта в meta */
function mid(def: ParamDef): number {
  const lo = Number.isFinite(def.min) ? def.min : 0;
  const hi = Number.isFinite(def.max) ? def.max : 1;
  return (lo + hi) / 2;
}

/* ── публично: дефиниции параметров для UI/расчётов ── */
export function getParamDefs(reg: RegistryT, modelKey?: string, fallbackKey?: string) {
  const merged =
    resolveExtends(reg, modelKey) ||
    resolveExtends(reg, fallbackKey) ||
    {};
  return merged;
}

/** материализует набор параметров: param_bindings поверх дефиниций модели */
export function materializeParams(meta: any, reg: RegistryT, fallbackModelKey?: string) {
  const defs = getParamDefs(reg, meta?.model_ref, fallbackModelKey);
  const base: Record<string, number> = {};
  for (const [k, d] of Object.entries(defs)) base[k] = mid(d);
  // поверх — то, что пришло из карточки
  const p = { ...base, ...(meta?.param_bindings || {}) };
  return p;
}

/* ── compute ── */
export function computeObject(meta: any, registry: RegistryT, branch: string) {
  const p = materializeParams(meta, registry, "object");
  const dose = computeDose(p.E ?? p.E0 ?? 0, p["A*"] ?? p.A_star ?? 0);

  const Pv = computePvObject(p, { branch: (branch as BranchT) || registry.branch, hasChron: true, hasIris: (branch || registry.branch) !== 'pre-borders' });
  const Vsigma = computeVsigmaObject(p, dose, { branch: (branch as BranchT) || registry.branch });
  const drift = computeDriftObject(p, { dose });

  const topo = Number(p.topo ?? p.topo_class ?? 0);
  const witness = Number(p.witness_count ?? 0);

  const S = computeStability(
    { Pv, Vsigma, drift, topo, witness, branch: (branch as BranchT) || registry.branch }
  );

  return { Pv, Vsigma, S, dose, drift, topo, witness };
}

export function computeCharacter(meta: any, registry: RegistryT, branch: string) {
  const p = materializeParams(meta, registry, "character");

  const Pv = computePvCharacter(p, { branch: (branch as BranchT) || registry.branch });
  const Vsigma = computeVsigmaCharacter(p, { branch: (branch as BranchT) || registry.branch });

  const influence = computeInfluenceCharacter(p);
  const monstro_pr = computeMonstroPr(p); // читает stress/dark/loyalty/causal_penalty, если есть
  const drift = computeDriftCharacter(p);

  const topo = Number(p.topo ?? p.topo_class ?? 0);
  const witness = Number(p.witness_count ?? 0);
  const S = computeStability(
    { Pv, Vsigma, drift, topo, witness, branch: (branch as BranchT) || registry.branch }
  );

  return { Pv, Vsigma, S, influence, monstro_pr, drift, topo, witness };
}

/* ── симуляторы ── */
export function simulateObject(meta: any, days = 30, registry?: RegistryT, branch?: string) {
  const p0 = materializeParams(meta, registry || {}, "object");
  const out: Array<any> = [];
  for (let t = 0; t < days; t++) {
    // пример динамики: медленный дрейф и лёгкий апдейт E
    const p = {
      ...p0,
      drift: Number(p0.drift ?? 0) + 0.02 * t,
      E: Number(p0.E ?? 0) * (1 + 0.01 * Math.sin(t / 3))
    };
    const snap = computeObject({ ...meta, param_bindings: p }, registry || ({} as any), (branch || ""));
    out.push({ t, ...snap });
  }
  return out;
}

export function simulateCharacter(meta: any, days = 30, registry?: RegistryT, branch?: string) {
  const p0 = materializeParams(meta, registry || {}, "character");
  const out: Array<any> = [];
  for (let t = 0; t < days; t++) {
    const p = {
      ...p0,
      stress: clamp(Number(p0.stress ?? 0) + 0.01 * t, 0, 1),
      dark_exposure: clamp(Number(p0.dark_exposure ?? 0) + (t % 7 === 0 ? 0.05 : 0), 0, 1)
    };
    const snap = computeCharacter({ ...meta, param_bindings: p }, registry || ({} as any), (branch || ""));
    out.push({ t, ...snap });
  }
  return out;
}

/* ── 7d тренд для спарклайнов ── */
export function simulate7d(meta: any, registry: RegistryT, branch: string) {
  const type = String(meta?.type || meta?.model_ref || "object");
  const sim = type === "character"
    ? simulateCharacter(meta, 7, registry, branch)
    : simulateObject(meta, 7, registry, branch);
  return sim.map((r, i) => ({ day: i, S: r.S ?? 0, Pv: r.Pv ?? 0, Vsigma: r.Vsigma ?? 0 }));
}

/* ── удобный универсал (не ломает старое API) ── */
export function computeEntity(meta: any, registry: RegistryT, branch: string) {
  const type = String(meta?.type || meta?.model_ref || "object");
  return type === "character"
    ? computeCharacter(meta, registry, branch)
    : computeObject(meta, registry, branch);
}
