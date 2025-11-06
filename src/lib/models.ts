// src/lib/models.ts
export type ParamBag = Record<string, number>;

export type RegistryT = {
  models?: Record<
    string,
    {
      params?: Record<string, { min: number; max: number; step?: number; label?: string }>;
    }
  >;
};

export type Metrics = {
  Pv: number;
  Vsigma: number;
  S: number;
  dose?: number;
  drift?: number;
  topo?: number;
  influence?: number;
  monstro_pr?: number;
  risk_dry?: number;
  risk_decay?: number;
};

export type SeriesPoint = { t: number } & Partial<Metrics> & Partial<ParamBag>;

const sigm = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const nz = (x: any, d: number) => (Number.isFinite(+x) ? +x : d);

/* ---------------- OBJECT ---------------- */
export function computeObject(meta: any, _registry: RegistryT, _branch: string): Metrics {
  const p = meta?.param_bindings || {};

  const A = nz(p["A*"] ?? p.A_star, 100);
  const E = nz(p.E ?? p.E0, 0);
  const ex = nz(p.exergy_cost, 0.0);
  const infra = nz(p.infra_footprint, 0.0);
  const haz = nz(p.hazard_rate, 0.0);
  const topo = nz(p.topo, 0.2);
  const wcount = nz(p.witness_count, 0);

  const dose = A ? E / A : 0;
  const risk_dry = Math.max(0, E - A) ** 2 * 1e-3;
  const risk_decay = Math.max(0, A - E) * 2e-3;

  const Pv = 0.35 * Math.log1p(wcount) + 0.25 * topo;
  const Vsigma = 0.7 * ex + 0.8 * infra + 0.9 * haz + (risk_dry + 0.5 * risk_decay);

  const drift = 0.25 + 0.15 * Math.abs(dose - 1);
  const S = sigm(1.2 * Pv - 1.1 * Vsigma - 0.9 * drift + 0.8 * topo + 0.25 * Math.log1p(wcount));

  return { Pv, Vsigma, S, dose, drift, topo, risk_dry, risk_decay };
}

export function simulateObject(meta: any, days = 30): SeriesPoint[] {
  const p = meta?.param_bindings || {};
  const A = nz(p["A*"] ?? p.A_star, 100);
  let E = nz(p.E ?? p.E0, 0);

  const rho = nz(p.rho, 0.98);
  const v = nz(p.views ?? Math.sqrt(nz(p.witness_count, 0)), 8);
  const q = clamp01(nz(p.q ?? 0.6 + 0.08 * nz(p.topo, 0.2), 0.6));

  let D = 0.25;
  const theta = 0.05, Dbar = 0.2, eta = 0.10;

  const out: SeriesPoint[] = [];
  for (let t = 0; t <= days; t++) {
    const stat = computeObject({ param_bindings: { ...p, E } }, {} as any, "current");
    out.push({ t, ...stat, E });
    E = rho * E + v * q;
    const dose = A ? E / A : 0;
    D = D + theta * (Dbar - D) + eta * Math.abs(dose - 1);
  }
  return out;
}

/* --------------- CHARACTER ------------- */
export function computeCharacter(meta: any, _registry: RegistryT, _branch: string): Metrics {
  const p = meta?.param_bindings || {};
  const will = nz(p.will, 0.0);
  const comp = nz(p.competence, 0.0);
  const res = nz(p.resources, 0.0);
  const loy = nz(p.loyalty, 0.0);
  const stress = clamp01(nz(p.stress, 0.0));
  const riskTol = clamp01(nz(p.risk_tolerance, 0.0));
  const topo = nz(p.topo ?? 0.2, 0.2);

  const influence = (0.6 * will + 0.6 * comp + 0.4 * res) * (0.7 + 0.3 * loy);
  const Pv = 0.25 + 0.6 * influence - 0.2 * stress;
  const Vsigma = 0.3 * stress + 0.25 * riskTol;

  const drift = 0.2 + 0.3 * stress;
  const S = sigm(1.1 * Pv - 1.0 * Vsigma - 0.8 * drift + 0.7 * topo);
  const monstro_pr = sigm(2.2 * stress + 0.8 * Vsigma - 1.3 * loy);

  return { Pv, Vsigma, S, topo, drift, influence, monstro_pr };
}

export function simulateCharacter(meta: any, days = 30): SeriesPoint[] {
  const p = { ...meta?.param_bindings } || {};
  let stress = clamp01(nz(p.stress, 0.0));
  const dec = 0.01, shock = clamp01(nz(p.shock ?? 0, 0));

  const out: SeriesPoint[] = [];
  for (let t = 0; t <= days; t++) {
    const snap = computeCharacter({ param_bindings: { ...p, stress } }, {} as any, "current");
    out.push({ t, ...snap, stress });
    if (t === 0) stress = clamp01(stress + shock);
    stress = clamp01(stress - dec);
  }
  return out;
}
