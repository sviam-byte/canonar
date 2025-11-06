// src/lib/eligibility.ts
import type { RegistryT } from "./types";

export type EligibilityReport = { key: string; ok: boolean; reasons: string[] };

// простые эвристики, если метрики не заданы
function fallbackMetric(key: string, tkey: string, params: Record<string, number>): number {
  const g = (k: string, d = 0) => Number.isFinite(params[k]) ? Number(params[k]) : d;
  if (key === "influence") {
    const infl = (g("will", .5) * 0.6 + g("competence", .5) * 0.6 + g("resources", .5) * 0.4) * (0.7 + 0.3 * g("loyalty", .5));
    return infl;
  }
  if (key === "bootstrap") {
    return 0.5 * (g("resources", .5) + g("competence", .5));
  }
  if (key === "monstro_pr") {
    const base = 0.6 * g("stress", .3) + 0.4 * g("dark_exposure", .2);
    return Math.max(0, Math.min(1, base));
  }
  if (key === "localize") {
    return tkey === "character"
      ? 0.5 * (g("competence", .5) + g("will", .5))
      : 1 - Math.min(1, Math.max(0, g("hazard_rate", .2)));
  }
  if (key === "Pv") return g("Pv", .5);
  return 0;
}

export function getEligibility(
  tkey: string,
  metrics: Record<string, number>,
  params: Record<string, number>,
  registry: RegistryT
): EligibilityReport[] {
  const cfg = registry.eligibility || {};
  const out: EligibilityReport[] = [];

  // helper
  const m = (k: string) =>
    Number.isFinite((metrics as any)[k]) ? Number((metrics as any)[k]) : fallbackMetric(k, tkey, params);

  if (cfg.negotiation) {
    const min = Number(cfg.negotiation.corridor_min ?? 0.6);
    const ok = m("Pv") >= min || m("influence") >= min;
    const reasons: string[] = [];
    if (!ok) reasons.push(`требуется Pv или influence ≥ ${min.toFixed(2)}`);
    out.push({ key: "negotiation", ok, reasons });
  }

  if (cfg.repair_nomonstr) {
    const bmin = Number(cfg.repair_nomonstr.bootstrap_min ?? 0.55);
    const pmax = Number(cfg.repair_nomonstr.monstro_pr_max ?? 0.35);
    const ok = m("bootstrap") >= bmin && m("monstro_pr") <= pmax;
    const reasons: string[] = [];
    if (m("bootstrap") < bmin) reasons.push(`bootstrap < ${bmin.toFixed(2)}`);
    if (m("monstro_pr") > pmax) reasons.push(`Pr[monstro] > ${pmax.toFixed(2)}`);
    out.push({ key: "repair_nomonstr", ok, reasons });
  }

  if (cfg.incident_localize) {
    const lmin = Number(cfg.incident_localize.localize_min ?? 0.6);
    const ok = m("localize") >= lmin;
    const reasons: string[] = [];
    if (!ok) reasons.push(`localize < ${lmin.toFixed(2)}`);
    out.push({ key: "incident_localize", ok, reasons });
  }

  return out;
}

export function scenarioRelevantParams(tkey: string, scenario: string): string[] {
  // минимальная подсветка «что дергать»
  if (tkey === "character") {
    if (scenario === "negotiation") return ["will", "competence", "loyalty", "resources"];
    if (scenario === "repair_nomonstr") return ["stress", "risk_tolerance", "dark_exposure", "competence"];
    if (scenario === "incident_localize") return ["competence", "will", "mandate_power"];
  }
  // объекты
  if (tkey === "object") {
    if (scenario === "negotiation") return ["q", "witness_count"];
    if (scenario === "repair_nomonstr") return ["E", "A*", "hazard_rate", "exergy_cost"];
    if (scenario === "incident_localize") return ["hazar]()_
