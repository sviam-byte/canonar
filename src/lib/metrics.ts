// src/lib/metrics.ts

/* ── базовые утилиты ── */
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const sigma = (x: number) => 1 / (1 + Math.exp(-x));
export const log1p = (x: number) => Math.log(1 + Math.max(-0.999999, x)); // защитим лог

/* ── контекст, опционально ── */
type Ctx = {
  branch?: 'pre-borders'|'pre-rector'|'current';
  hasChron?: boolean;
  hasIris?: boolean;
};

/* ── объект: дозировка/риск/долг ── */
export function computeDose(E: number, Astar: number) {
  if (!Astar || !Number.isFinite(Astar)) return 0;
  return E / Astar;
}

export function computePvObject(p: Record<string, any>, ctx: Ctx = {}) {
  const witness = Number(p.witness_count ?? 0);
  const topo = Number(p.topo ?? p.topo_class ?? 0);
  const dose = computeDose(p.E ?? p.E0 ?? 0, p["A*"] ?? p.A_star ?? 0);
  const dose_err = Math.abs(1 - dose);

  // базовая эвристика
  let Pv = 0.6 * log1p(witness) + 0.4 * topo - 0.3 * dose_err;

  // мягкие гейты эпох/ресурсов (без ломки старого API)
  if (ctx.branch === 'pre-borders') {
    Pv *= 0.8;              // слабая память общества
  }
  if (ctx.hasChron === false) {
    Pv *= 0.7;              // без верификатора — шумно
  }
  return Pv;
}

export function computeVsigmaObject(p: Record<string, any>, dose: number, ctx: Ctx = {}) {
  const ex = Number(p.exergy_cost ?? 0);
  const infra = Number(p.infra_footprint ?? 0);
  const hz = Number(p.hazard_rate ?? 0);
  const cvar = Number(p.cvar ?? p.cvar_alpha ?? 0);
  const causal = Number(p.causal_penalty ?? 0);

  const dose_err = Math.abs(1 - (Number.isFinite(dose) ? dose : 0));
  const Pi = dose_err; // сворачиваем риск пересушки/недокорма в одну простую компоненту

  // веса допускают переопределение из карточки
  const l1 = Number(p.l1 ?? 0.45);
  const l2 = Number(p.l2 ?? 0.35);
  const l3 = Number(p.l3 ?? 0.35);
  const l4 = Number(p.l4 ?? 0.30);
  const l5 = Number(p.l5 ?? 0.35);

  let V = l1 * ex + l2 * infra + 0.4 * hz + l3 * cvar + l4 * causal + l5 * Pi;

  // эпохи: до Ректора «этический множитель» слабее
  if (ctx.branch === 'pre-rector') V *= 0.95;

  return V;
}

export function computeDriftObject(p: Record<string, any>, opt?: { dose?: number }) {
  const hz = Number(p.hazard_rate ?? 0);
  const ex = Number(p.exergy_cost ?? 0);
  const infra = Number(p.infra_footprint ?? 0);
  const badDose = Math.abs((opt?.dose ?? 1) - 1);

  // добавим вклад кривой дозы (мягко)
  return 0.5 * hz + 0.25 * ex + 0.2 * infra + 0.15 * badDose;
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
  const causal = Number(p.causal_penalty ?? 0);
  const loy = Number(p.loyalty ?? 0.5);
  // лояльность снижает риск «монстра»
  return clamp(0.6 * stress + 0.4 * dark + 0.3 * causal - 0.25 * loy, 0, 1);
}

export function computePvCharacter(p: Record<string, any>, _ctx: Ctx = {}) {
  // пригодность персонажа к задачам
  const infl = computeInfluenceCharacter(p);
  const risk = Number(p.risk_tolerance ?? 0.5);
  return infl * (0.8 + 0.2 * (1 - Math.abs(risk - 0.5) * 2));
}

export function computeVsigmaCharacter(p: Record<string, any>, _ctx: Ctx = {}) {
  const stress = Number(p.stress ?? 0.3);
  const dark = Number(p.dark_exposure ?? 0.2);
  const causal = Number(p.causal_penalty ?? 0);
  const infra = Number(p.infra_footprint ?? 0);
  return 0.7 * stress + 0.5 * dark + 0.25 * causal + 0.15 * infra;
}

export function computeDriftCharacter(p: Record<string, any>) {
  const stress = Number(p.stress ?? 0.3);
  const risk = Number(p.risk_tolerance ?? 0.5);
  return 0.6 * stress + 0.2 * Math.abs(risk - 0.5);
}

/* ── общая стабильность формы ── */
export function computeStability(args: {
  Pv: number; Vsigma: number; drift: number; topo: number; witness: number; branch?: 'pre-borders'|'pre-rector'|'current';
}) {
  const { Pv, Vsigma, drift, topo, witness, branch } = args;
  // память общества слабее до Границы
  const memMult = branch === 'pre-borders' ? 0.4 : branch === 'pre-rector' ? 0.7 : 1.0;
  return sigma(
    1.2 * Pv - 1.1 * Vsigma - 0.9 * drift + 0.8 * topo + 0.25 * log1p(witness) * memMult
  );
}
