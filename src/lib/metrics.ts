// src/lib/metrics.ts

/* ── базовые утилиты ── */
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const sigma = (x: number) => 1 / (1 + Math.exp(-x));
export const log1p = (x: number) => Math.log(1 + Math.max(-0.999999, x)); // защитим лог

/* ── объект: дозировка/риск/долг ── */
export function computeDose(E: number, Astar: number) {
  if (!Astar || !Number.isFinite(Astar)) return 0;
  return E / Astar;
}

export function computePvObject(p: Record<string, any>) {
  const witness = Number(p.witness_count ?? 0);
  const topo = Number(p.topo ?? p.topo_class ?? 0);
  const dose = computeDose(p.E ?? p.E0 ?? 0, p["A*"] ?? p.A_star ?? 0);
  const dose_err = Math.abs(1 - dose);
  // Pv растёт с логом свидетелей и топо, падает при ошибке дозы
  return 0.6 * log1p(witness) + 0.4 * topo - 0.3 * dose_err;
}

export function computeVsigmaObject(p: Record<string, any>, dose: number) {
  const ex = Number(p.exergy_cost ?? 0);
  const infra = Number(p.infra_footprint ?? 0);
  const hz = Number(p.hazard_rate ?? 0);
  const dose_err = Math.abs(1 - (Number.isFinite(dose) ? dose : 0));
  // Онтологический долг растёт с издержками, инфрой, опасностью и ошибкой дозы
  return 0.45 * ex + 0.35 * infra + 0.4 * hz + 0.35 * dose_err;
}

export function computeDriftObject(p: Record<string, any>) {
  const hz = Number(p.hazard_rate ?? 0);
  const ex = Number(p.exergy_cost ?? 0);
  const infra = Number(p.infra_footprint ?? 0);
  return 0.5 * hz + 0.25 * ex + 0.2 * infra;
}

/* ── персонажи: влияние/монстро/долг ── */
export function computeInfluenceCharacter(p: Record<string, any>) {
  const will = Number(p.will ?? 0.5);
  const comp = Number(p.competence ?? 0.5);
  const res = Number(p.resources ?? 0.5);
  const loy = Number(p.loyalty ?? 0.5);
  return (0.6 * will + 0.6 * comp + 0.4 * res) * (0.7 + 0.3 * loy);
}

export function computeMonstroPr(p: Record<string, any>) {
  const stress = Number(p.stress ?? 0);
  const dark = Number(p.dark_exposure ?? 0);
  return clamp(0.6 * stress + 0.4 * dark, 0, 1);
}

export function computePvCharacter(p: Record<string, any>) {
  // простая эвристика пригодности персонажа к задачам
  const infl = computeInfluenceCharacter(p);
  const risk = Number(p.risk_tolerance ?? 0.5);
  return infl * (0.8 + 0.2 * (1 - Math.abs(risk - 0.5) * 2));
}

export function computeVsigmaCharacter(p: Record<string, any>) {
  const stress = Number(p.stress ?? 0.3);
  const dark = Number(p.dark_exposure ?? 0.2);
  return 0.7 * stress + 0.5 * dark;
}

export function computeDriftCharacter(p: Record<string, any>) {
  const stress = Number(p.stress ?? 0.3);
  const risk = Number(p.risk_tolerance ?? 0.5);
  return 0.6 * stress + 0.2 * Math.abs(risk - 0.5);
}

/* ── общая стабильность формы ── */
export function computeStability(args: {
  Pv: number; Vsigma: number; drift: number; topo: number; witness: number;
}) {
  const { Pv, Vsigma, drift, topo, witness } = args;
  return sigma(1.2 * Pv - 1.1 * Vsigma - 0.9 * drift + 0.8 * topo + 0.25 * log1p(witness));
}
