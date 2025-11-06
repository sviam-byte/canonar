// src/lib/eligibility.ts

export type EligibilityItem = {
  key: string;          // machine id
  label: string;        // human label
  ok: boolean;          // pass/fail by thresholds
  score: number;        // 0..1 aggregate
  why: string;          // short explanation
};

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

// pick metric with param fallback
function pick(
  metrics: Record<string, unknown>,
  params: Record<string, unknown>,
  keys: string[],
  def = 0
) {
  for (const k of keys) {
    const mv = (metrics as any)?.[k];
    if (typeof mv === "number") return mv;
    const pv = (params as any)?.[k];
    if (typeof pv === "number") return pv;
  }
  return def;
}

// simple aggregator to 0..1
function zOriented(x: number, target: number, tol: number) {
  // 1 at |x-target|=0, falls to 0 at |x-target|>=tol
  const d = Math.abs(x - target);
  return clamp(1 - d / Math.max(tol, 1e-9));
}
function preferHigh(x: number, knee = 0.6) {
  return clamp((x - knee) / Math.max(1 - knee, 1e-9));
}
function preferLow(x: number, knee = 0.4) {
  return clamp((knee - x) / Math.max(knee, 1e-9));
}

export function scenarioRelevantParams(tkey: string, scenario: string): string[] {
  const c = (arr: string[]) => arr;
  if (tkey === "character") {
    switch (scenario) {
      case "negotiation":
        return c(["will", "competence", "resources", "loyalty", "stress", "risk_tolerance"]);
      case "repair_nomonstr":
        return c(["stress", "risk_tolerance", "mandate_power", "resources", "topo", "dark_exposure"]);
      case "incident_localize":
        return c(["topo", "resources", "mandate_power", "competence", "risk_tolerance"]);
      default:
        return [];
    }
  }
  // object | place | protocol | event | document → по умолчанию объектные
  switch (scenario) {
    case "negotiation":
      return c(["witness_count", "topo", "q", "causal_penalty"]);
    case "repair_nomonstr":
      return c(["E", "A*", "hazard_rate", "exergy_cost", "infra_footprint", "cvar_alpha"]);
    case "incident_localize":
      return c(["topo", "rho", "causal_penalty", "hazard_rate"]);
    default:
      return [];
  }
}

export function getEligibility(
  tkey: string,
  metricsIn: Record<string, unknown>,
  paramsIn: Record<string, unknown>,
  _registry?: unknown
): EligibilityItem[] {
  const m = (k: string, d = 0) => num((metricsIn as any)?.[k], d);
  const p = (k: string, d = 0) => num((paramsIn as any)?.[k], d);

  // derived/fallbacks
  const Pv      = m("Pv");
  const Vsigma  = m("Vsigma");
  const S       = m("S");
  const drift   = m("drift");
  const topo    = m("topo", p("topo", p("topo_class", 0)));
  const dose    = m("dose", (() => {
    const A = p("A*", p("A_star", 0)) || 0;
    const E = p("E", p("E0", 0)) || 0;
    return A > 0 ? E / A : 0;
  })());

  // character extras
  const stress       = p("stress", 0.3);
  const darkExposure = p("dark_exposure", 0.2);
  const will         = p("will", 0.5);
  const competence   = p("competence", 0.5);
  const resources    = p("resources", 0.5);
  const loyalty      = p("loyalty", 0.5);
  const influence    = m("influence", (will * 0.6 + competence * 0.6 + resources * 0.4) * (0.7 + 0.3 * loyalty));
  const monstro_pr   = m("monstro_pr", clamp(0.6 * stress + 0.4 * darkExposure));

  // object extras
  const hazard_rate    = p("hazard_rate", 0.0);
  const exergy_cost    = p("exergy_cost", 0.0);
  const infra_footprint= p("infra_footprint", 0.0);
  const witness_count  = p("witness_count", 0);
  const q              = p("q", 0.0);

  const items: EligibilityItem[] = [];

  if (tkey === "character") {
    // Переговоры: высокий Pv/Influence, достаточная S, низкий риск монстра и стресс
    {
      const s1 = preferHigh(Pv, 0.6);
      const s2 = preferHigh(influence, 0.6);
      const s3 = preferHigh(S, 0.5);
      const s4 = preferLow(monstro_pr, 0.3);
      const s5 = preferLow(stress, 0.5);
      const score = clamp((s1 + s2 + s3 + s4 + s5) / 5);
      items.push({
        key: "negotiation",
        label: "Переговоры",
        ok: score >= 0.55,
        score,
        why: `Pv=${Pv.toFixed(2)}, Infl=${influence.toFixed(2)}, S=${S.toFixed(2)}, mon=${monstro_pr.toFixed(2)}, stress=${stress.toFixed(2)}`
      });
    }

    // Ремонт без монстра: низкая Vσ, низкий монстрориск, умеренный стресс, достаточная S
    {
      const s1 = preferLow(Vsigma, 0.4);
      const s2 = preferLow(monstro_pr, 0.25);
      const s3 = preferLow(stress, 0.4);
      const s4 = preferHigh(S, 0.5);
      const score = clamp((s1 + s2 + s3 + s4) / 4);
      items.push({
        key: "repair_nomonstr",
        label: "Ремонт без монстра",
        ok: score >= 0.55,
        score,
        why: `Vσ=${Vsigma.toFixed(2)}, mon=${monstro_pr.toFixed(2)}, stress=${stress.toFixed(2)}, S=${S.toFixed(2)}`
      });
    }

    // Локализация инцидента: низкий drift, высокий topo, достаточная S
    {
      const s1 = preferLow(drift, 0.3);
      const s2 = preferHigh(topo, 0.6);
      const s3 = preferHigh(S, 0.5);
      const score = clamp((s1 + s2 + s3) / 3);
      items.push({
        key: "incident_localize",
        label: "Локализация инцидента",
        ok: score >= 0.55,
        score,
        why: `drift=${drift.toFixed(2)}, topo=${topo.toFixed(2)}, S=${S.toFixed(2)}`
      });
    }

    return items;
  }

  // OBJECT-like (object/place/protocol/event/document) базовые сценарии:

  // Стабильное развёртывание: доза близка к 1, низкая Vσ, умеренная опасность
  {
    const s1 = zOriented(dose, 1.0, 0.15);
    const s2 = preferLow(Vsigma, 0.4);
    const s3 = preferLow(hazard_rate, 0.4);
    const score = clamp((s1 + s2 + s3) / 3);
    items.push({
      key: "deploy_stable",
      label: "Стабильное развёртывание",
      ok: score >= 0.55,
      score,
      why: `dose=${dose.toFixed(2)}, Vσ=${Vsigma.toFixed(2)}, hazard=${hazard_rate.toFixed(2)}`
    });
  }

  // Низкий след: низкие издержки инфраструктуры и эксергии
  {
    const s1 = preferLow(exergy_cost, 0.4);
    const s2 = preferLow(infra_footprint, 0.4);
    const score = clamp((s1 + s2) / 2);
    items.push({
      key: "low_footprint",
      label: "Низкий инфраструктурный след",
      ok: score >= 0.6,
      score,
      why: `exergy=${exergy_cost.toFixed(2)}, infra=${infra_footprint.toFixed(2)}`
    });
  }

  // Безопасно для толпы: невысокая опасность, достаточная стабильность, не перегружать свидетелями при высоком hazard
  {
    const s1 = preferLow(hazard_rate, 0.35);
    const s2 = preferHigh(S, 0.5);
    const crowdPenalty = hazard_rate > 0.35 ? clamp(1 - witness_count / 300) : 1;
    const score = clamp((s1 + s2) * 0.5 * crowdPenalty);
    items.push({
      key: "crowd_safe",
      label: "Безопасно для толпы",
      ok: score >= 0.55,
      score,
      why: `hazard=${hazard_rate.toFixed(2)}, S=${S.toFixed(2)}, witnesses=${witness_count}`
    });
  }

  // Инцидент локализуем: низкий дрейф, высокий topo, адекватная доза
  {
    const s1 = preferLow(drift, 0.3);
    const s2 = preferHigh(topo, 0.6);
    const s3 = zOriented(dose, 1.0, 0.2);
    const score = clamp((s1 + s2 + s3) / 3);
    items.push({
      key: "incident_localize",
      label: "Локализация инцидента",
      ok: score >= 0.55,
      score,
      why: `drift=${drift.toFixed(2)}, topo=${topo.toFixed(2)}, dose=${dose.toFixed(2)}`
    });
  }

  return items;
}
