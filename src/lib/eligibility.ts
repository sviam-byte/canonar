// src/lib/eligibility.ts
import type { RegistryT } from "./models";

/* ── тип ── */
export type EligibilityItem = {
  key: string;
  label: string;
  ok: boolean;
  score: number;
  why: string;
};

/* ── утилиты ── */
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const log1p = (x: number) => Math.log(1 + Math.max(-0.999999, x));

const zOriented = (x: number, target: number, tol: number) => {
  const d = Math.abs(x - target);
  return clamp(1 - d / Math.max(tol, 1e-9));
};
const preferHigh = (x: number, knee = 0.6) => clamp((x - knee) / Math.max(1 - knee, 1e-9));
const preferLow = (x: number, knee = 0.4) => clamp((knee - x) / Math.max(knee, 1e-9));

/* ── сценарные подсказки для подсветки слайдеров ── */
export function scenarioRelevantParams(tkey: string, scenario: string): string[] {
  const c = (arr: string[]) => arr;
  const commonObj = {
    negotiation: ["witness_count", "topo", "q", "causal_penalty"],
    repair_nomonstr: ["E", "A*", "hazard_rate", "exergy_cost", "infra_footprint", "cvar_alpha"],
    incident_localize: ["topo", "rho", "causal_penalty", "hazard_rate"],
    evac_corridor: ["Pv", "S", "drift", "topo", "witness_count"],
    trade_treaty: ["credibility", "bias", "novelty", "q", "topo"],
    stealth_surface: ["hazard_rate", "rho", "cvar_alpha"],
    containment: ["hazard_rate", "exergy_cost", "infra_footprint", "A*", "E"],
    o2_surplus_route: ["O2_margin", "load_factor", "shock_freq"],
    budget_ok: ["exergy_cost", "infra_footprint"],
    evidence_publish: ["credibility", "bias", "novelty"],
    rollback_safe: ["reversibility", "Vsigma"],
    quarantine_needed: ["hazard_rate", "drift", "Vsigma"],
  } as Record<string, string[]>;

  if (tkey === "character") {
    const char = {
      negotiation: ["will", "competence", "resources", "loyalty", "stress", "risk_tolerance"],
      repair_nomonstr: ["stress", "risk_tolerance", "mandate_power", "resources", "topo", "dark_exposure"],
      incident_localize: ["topo", "resources", "mandate_power", "competence", "risk_tolerance"],
      evac_corridor: ["will", "competence", "resources", "topo"],
      trade_treaty: ["competence", "will", "loyalty", "bias", "credibility"],
      stealth_surface: ["dark_exposure", "stress", "risk_tolerance"],
      containment: ["risk_tolerance", "stress", "dark_exposure"],
    } as Record<string, string[]>;
    return char[scenario] ?? [];
  }
  return commonObj[scenario] ?? [];
}

/* ── конфиги порогов из registry ── */
function cfg(reg: RegistryT | undefined, key: string) {
  return ((reg?.eligibility || {}) as any)[key] ?? {};
}

/* ── API ── */
export function getEligibility(
  tkey: string,
  metricsIn: Record<string, unknown>,
  paramsIn: Record<string, unknown>,
  registry?: RegistryT
): EligibilityItem[] {
  const m = (k: string, d = 0) => num((metricsIn as any)?.[k], d);
  const p = (k: string, d = 0) => num((paramsIn as any)?.[k], d);

  // derived
  const Pv = m("Pv");
  const Vsigma = m("Vsigma");
  const S = m("S");
  const drift = m("drift");
  const topo = m("topo", p("topo", p("topo_class", 0)));
  const dose = m(
    "dose",
    (() => {
      const A = p("A*", p("A_star", 0)) || 0;
      const E = p("E", p("E0", 0)) || 0;
      return A > 0 ? E / A : 0;
    })()
  );
  const witness = m("witness", p("witness_count", 0));

  // character
  const stress = p("stress", 0.3);
  const dark = p("dark_exposure", 0.2);
  const will = p("will", 0.5);
  const competence = p("competence", 0.5);
  const resources = p("resources", 0.5);
  const loyalty = p("loyalty", 0.5);
  const influence = m(
    "influence",
    (0.6 * will + 0.6 * competence + 0.4 * resources) * (0.7 + 0.3 * loyalty)
  );
  const monstro = m("monstro_pr", clamp(0.6 * stress + 0.4 * dark));

  // object-like
  const hazard = p("hazard_rate", 0);
  const exergy = p("exergy_cost", 0);
  const infra = p("infra_footprint", 0);

  // place-like
  const O2m = p("O2_margin", 0);
  const load = p("load_factor", 1);
  const shock = p("shock_freq", 0);

  const items: EligibilityItem[] = [];

  /* ── персонажи ── */
  if (tkey === "character") {
    { // negotiation
      const c = cfg(registry, "negotiation");
      const score =
        (preferHigh(Pv, c.pv_min ?? 0.6) +
          preferHigh(influence, c.influence_min ?? 0.6) +
          preferHigh(S, c.s_min ?? 0.5) +
          preferLow(monstro, c.monstro_max ?? 0.3) +
          preferLow(stress, c.stress_max ?? 0.5)) /
        5;
      items.push({
        key: "negotiation",
        label: "Переговоры",
        ok: score >= (c.ok_min ?? 0.55),
        score: clamp(score),
        why: `Pv=${Pv.toFixed(2)}, Infl=${influence.toFixed(2)}, S=${S.toFixed(2)}, mon=${monstro.toFixed(2)}, stress=${stress.toFixed(2)}`,
      });
    }
    { // repair_nomonstr
      const c = cfg(registry, "repair_nomonstr");
      const score =
        (preferLow(Vsigma, c.vsigma_max ?? 0.4) +
          preferLow(monstro, c.monstro_max ?? 0.25) +
          preferLow(stress, c.stress_max ?? 0.4) +
          preferHigh(S, c.s_min ?? 0.5)) /
        4;
      items.push({
        key: "repair_nomonstr",
        label: "Ремонт без монстра",
        ok: score >= (c.ok_min ?? 0.55),
        score: clamp(score),
        why: `Vσ=${Vsigma.toFixed(2)}, mon=${monstro.toFixed(2)}, stress=${stress.toFixed(2)}, S=${S.toFixed(2)}`,
      });
    }
    { // incident_localize
      const c = cfg(registry, "incident_localize");
      const score =
        (preferLow(drift, c.drift_max ?? 0.3) +
          preferHigh(topo, c.topo_min ?? 0.6) +
          preferHigh(S, c.s_min ?? 0.5)) /
        3;
      items.push({
        key: "incident_localize",
        label: "Локализация инцидента",
        ok: score >= (c.ok_min ?? 0.55),
        score: clamp(score),
        why: `drift=${drift.toFixed(2)}, topo=${topo.toFixed(2)}, S=${S.toFixed(2)}`,
      });
    }
    { // evac_corridor
      const c = cfg(registry, "evac_corridor");
      const score =
        (preferHigh(Pv, c.pv_min ?? 0.55) +
          preferHigh(S, c.s_min ?? 0.55) +
          preferLow(drift, c.drift_max ?? 0.6)) /
        3;
      items.push({
        key: "evac_corridor",
        label: "Эвакуационный коридор",
        ok: score >= (c.ok_min ?? 0.55),
        score: clamp(score),
        why: `Pv=${Pv.toFixed(2)}, S=${S.toFixed(2)}, drift=${drift.toFixed(2)}`,
      });
    }
    { // stealth_surface
      const c = cfg(registry, "stealth_surface");
      const score =
        (preferLow(monstro, c.monstro_max ?? 0.25) + preferLow(stress, c.stress_max ?? 0.4)) / 2;
      items.push({
        key: "stealth_surface",
        label: "Тихий выход на поверхность",
        ok: score >= (c.ok_min ?? 0.55),
        score: clamp(score),
        why: `mon=${monstro.toFixed(2)}, stress=${stress.toFixed(2)}`,
      });
    }
    return items;
  }

  /* ── объектные и прочие ── */

  { // deploy_stable
    const c = cfg(registry, "deploy_stable");
    const score =
      (zOriented(dose, 1.0, c.dose_tol ?? 0.15) +
        preferLow(Vsigma, c.vsigma_max ?? 0.4) +
        preferLow(hazard, c.hazard_max ?? 0.4)) /
      3;
    items.push({
      key: "deploy_stable",
      label: "Стабильное развёртывание",
      ok: score >= (c.ok_min ?? 0.55),
      score: clamp(score),
      why: `dose=${dose.toFixed(2)}, Vσ=${Vsigma.toFixed(2)}, hazard=${hazard.toFixed(2)}`,
    });
  }

  { // low_footprint
    const c = cfg(registry, "low_footprint");
    const score = (preferLow(exergy, c.exergy_max ?? 0.4) + preferLow(infra, c.infra_max ?? 0.4)) / 2;
    items.push({
      key: "low_footprint",
      label: "Низкий инфраструктурный след",
      ok: score >= (c.ok_min ?? 0.6),
      score: clamp(score),
      why: `exergy=${exergy.toFixed(2)}, infra=${infra.toFixed(2)}`,
    });
  }

  { // crowd_safe
    const c = cfg(registry, "crowd_safe");
    const base = (preferLow(hazard, c.hazard_max ?? 0.35) + preferHigh(S, c.s_min ?? 0.5)) / 2;
    const penalty = hazard > (c.hazard_max ?? 0.35) ? clamp(1 - (witness as number) / (c.witness_k ?? 300)) : 1;
    const score = clamp(base * penalty);
    items.push({
      key: "crowd_safe",
      label: "Безопасно для толпы",
      ok: score >= (c.ok_min ?? 0.55),
      score,
      why: `hazard=${hazard.toFixed(2)}, S=${S.toFixed(2)}, witnesses=${witness}`,
    });
  }

  { // incident_localize
    const c = cfg(registry, "incident_localize");
    const score =
      (preferLow(drift, c.drift_max ?? 0.3) +
        preferHigh(topo, c.topo_min ?? 0.6) +
        zOriented(dose, 1.0, c.dose_tol ?? 0.2)) /
      3;
    items.push({
      key: "incident_localize",
      label: "Локализация инцидента",
      ok: score >= (c.ok_min ?? 0.55),
      score: clamp(score),
      why: `drift=${drift.toFixed(2)}, topo=${topo.toFixed(2)}, dose=${dose.toFixed(2)}`,
    });
  }

  { // o2_surplus_route (для places)
    const c = cfg(registry, "o2_surplus_route");
    const score =
      (preferHigh(O2m, c.o2_min ?? 0.0) + preferLow(load, c.load_max ?? 1.2) + preferLow(shock, c.shock_max ?? 0.15)) /
      3;
    items.push({
      key: "o2_surplus_route",
      label: "Маршрут с O₂-запасом",
      ok: score >= (c.ok_min ?? 0.55),
      score: clamp(score),
      why: `O2=${O2m.toFixed(2)}, load=${load.toFixed(2)}, shock=${shock.toFixed(2)}`,
    });
  }

  { // budget_ok
    const c = cfg(registry, "budget_ok");
    const sum = exergy + infra;
    const score = preferLow(sum, c.budget_max ?? 0.8);
    items.push({
      key: "budget_ok",
      label: "Вписывается в бюджет",
      ok: score >= (c.ok_min ?? 0.55),
      score,
      why: `exergy+infra=${sum.toFixed(2)} (≤ ${(c.budget_max ?? 0.8).toFixed(2)})`,
    });
  }

  { // evidence_publish (documents/events)
    const c = cfg(registry, "evidence_publish");
    const cred = p("credibility", 0);
    const bias = p("bias", 0.5);
    const nov = p("novelty", 0);
    const score =
      (preferHigh(cred, c.cred_min ?? 0.6) + preferLow(bias, c.bias_max ?? 0.45) + preferHigh(nov, c.nov_min ?? 0.4)) /
      3;
    items.push({
      key: "evidence_publish",
      label: "Публиковать как доказательство",
      ok: score >= (c.ok_min ?? 0.55),
      score: clamp(score),
      why: `cred=${cred.toFixed(2)}, bias=${bias.toFixed(2)}, novelty=${nov.toFixed(2)}`,
    });
  }

  { // rollback_safe (protocols)
    const c = cfg(registry, "rollback_safe");
    const rev = p("reversibility", 0.5);
    const score = (preferHigh(rev, c.rev_min ?? 0.6) + preferLow(Vsigma, c.vsigma_max ?? 0.5)) / 2;
    items.push({
      key: "rollback_safe",
      label: "Безопасно откатить",
      ok: score >= (c.ok_min ?? 0.55),
      score: clamp(score),
      why: `rev=${rev.toFixed(2)}, Vσ=${Vsigma.toFixed(2)}`,
    });
  }

  { // quarantine_needed (alarm сценарий: «рекомендуется карантин»)
    const c = cfg(registry, "quarantine_needed");
    const score =
      (preferHigh(hazard, c.hazard_min ?? 0.6) + preferHigh(drift, c.drift_min ?? 0.5) + preferHigh(Vsigma, c.vsigma_min ?? 0.6)) /
      3;
    items.push({
      key: "quarantine_needed",
      label: "Рекомендуется карантин",
      ok: score >= (c.ok_min ?? 0.55),
      score: clamp(score),
      why: `hazard=${hazard.toFixed(2)}, drift=${drift.toFixed(2)}, Vσ=${Vsigma.toFixed(2)}`,
    });
  }

  return items;
}
