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

/* ── публично: дефиниции параметров для UI/расчётов ── */
export function getParamDefs(reg: RegistryT, modelKey?: string, fallbackKey?: string) {
  const merged =
    resolveExtends(reg, modelKey) ||
    resolveExtends(reg, fallbackKey) ||
    {};
  return merged;
}

/* ── compute ── */
export function computeObject(meta: any, _registry: RegistryT, _branch: string) {
  const p = meta?.param_bindings || {};
  const dose = computeDose(p.E ?? p.E0 ?? 0, p["A*"] ?? p.A_star ?? 0);
  const Pv = computePvObject(p);
  const Vsigma = computeVsigmaObject(p, dose);
  const drift = computeDriftObject(p);
  const topo = Number(p.topo ?? p.topo_class ?? 0);
  const witness = Number(p.witness_count ?? 0);
  const S = computeStability({ Pv, Vsigma, drift, topo, witness });
  return { Pv, Vsigma, S, dose, drift, topo, witness };
}

export function computeCharacter(meta: any, _registry: RegistryT, _branch: string) {
  const p = meta?.param_bindings || {};
  const Pv = computePvCharacter(p);
  const Vsigma = computeVsigmaCharacter(p);
  const influence = computeInfluenceCharacter(p);
  const monstro_pr = computeMonstroPr(p);
  const drift = computeDriftCharacter(p);
  const topo = Number(p.topo ?? 0);
  const witness = Number(p.witness_count ?? 0);
  const S = computeStability({ Pv, Vsigma, drift, topo, witness });
  return { Pv, Vsigma, S, influence, monstro_pr, drift, topo, witness };
}

/* ── симуляторы ── */
export function simulateObject(meta: any, days = 30) {
  const p0 = { ...(meta?.param_bindings || {}) };
  const out: Array<any> = [];
  for (let t = 0; t < days; t++) {
    const p = { ...p0, drift: Number(p0.drift ?? 0) + 0.02 * t };
    const snap = computeObject({ ...meta, param_bindings: p }, {} as any, "");
    out.push({ t, ...snap });
  }
  return out;
}

export function simulateCharacter(meta: any, days = 30) {
  const p0 = { ...(meta?.param_bindings || {}) };
  const out: Array<any> = [];
  for (let t = 0; t < days; t++) {
    const p = { ...p0, stress: clamp(Number(p0.stress ?? 0) + 0.01 * t, 0, 1) };
    const snap = computeCharacter({ ...meta, param_bindings: p }, {} as any, "");
    out.push({ t, ...snap });
  }
  return out;
}

/* ── 7d тренд для спарклайнов ── */
export function simulate7d(meta: any, _registry: RegistryT, _branch: string) {
  const type = String(meta?.type || meta?.model_ref || "object");
  const sim = type === "character" ? simulateCharacter(meta, 7) : simulateObject(meta, 7);
  return sim.map((r, i) => ({ day: i, S: r.S ?? 0, Pv: r.Pv ?? 0, Vsigma: r.Vsigma ?? 0 }));
}
