import { stepExposure, computePv, computeVsigma, stepDrift, computeTopoBonus, computeS } from "./metrics";
import type { Registry, ModelDef } from "./models";

export type SeriesPoint = { day: number; S: number; Pv: number; Vsigma: number; E: number; dose: number };
export type Intervention =
  | { t: number; kind: "exposure_plan"; Astar?: number; v?: number; q?: number; rho?: number }
  | { t: number; kind: "patch_plan"; R: number; s: number; effect?: number } // снижает Vsigma, поднимает Pv
  | { t: number; kind: "witness_rally"; addMw: number; addTopo?: number }
  | { t: number; kind: "shock"; cvarBoost: number; days: number }
  | { t: number; kind: "causal_surgery"; deltaC: number };

export type SimConfig = {
  days: number;
  registry: Registry;
  model: ModelDef;
  params: Record<string, number>;  // стартовые
  weights: {
    lambda: { x: number; cvar: number; infra: number; causal: number; dose: number };
    alpha:  { pv: number; vs: number; drift: number; topo: number; mw: number };
    kappa: number;
  };
  topoClass?: string;
  Mw0?: number;       // log(1+witness)
  D0?: number;        // дрейф старт
  E0?: number;        // экспозиция старт
  Astar0?: number;
};

export function simulate(config: SimConfig, interventions: Intervention[]): SeriesPoint[] {
  const N = config.days;
  const pts: SeriesPoint[] = [];

  let E = config.E0 ?? 50;
  let Astar = config.Astar0 ?? (config.params["Astar"] ?? 100);
  let v = config.params["v"] ?? 20;
  let q = config.params["q"] ?? 0.6;
  let rho = config.params["rho"] ?? 0.98;

  let Mw = config.Mw0 ?? 0.3;
  let Ttopo = computeTopoBonus(config.topoClass || "none", [0.2, 0.5]);
  let D = config.D0 ?? 0.0;

  let exergyX   = config.params["exergy"] ?? 1.0;
  let infraH    = config.params["infra"] ?? 0.5;
  let causalC   = config.params["causal"] ?? 0.2;
  let cvarLevel = config.params["cvar"]   ?? 0.3;

  const activeShocks = new Map<number, number>(); // day_end -> cvarBoost

  const byDay = new Map<number, Intervention[]>();
  for (const iv of interventions) {
    const arr = byDay.get(iv.t) || [];
    arr.push(iv);
    byDay.set(iv.t, arr);
  }

  for (let t=0; t<N; t++) {
    // применяем интервенции на день t
    for (const iv of (byDay.get(t) || [])) {
      if (iv.kind === "exposure_plan") {
        if (iv.Astar !== undefined) Astar = iv.Astar;
        if (iv.v     !== undefined) v = iv.v;
        if (iv.q     !== undefined) q = iv.q;
        if (iv.rho   !== undefined) rho = iv.rho;
      } else if (iv.kind === "patch_plan") {
        // патч: уменьшить Vsigma с лагом ноль, поднять Pv за счёт ψ(R,s)
        exergyX   = Math.max(0, exergyX - 0.2*iv.R*iv.s);
        infraH    = Math.max(0, infraH - 0.05*iv.R);
      } else if (iv.kind === "witness_rally") {
        Mw    += iv.addMw;
        Ttopo += iv.addTopo ?? 0.05;
      } else if (iv.kind === "shock") {
        cvarLevel += iv.cvarBoost;
        activeShocks.set(t + iv.days, iv.cvarBoost);
      } else if (iv.kind === "causal_surgery") {
        causalC = Math.max(0, causalC + iv.deltaC);
      }
    }

    // экспозиция
    const e = stepExposure(E, Astar, v, q, rho);
    E = e.E;
    const dosePenalty = e.riskDry + 0.5*e.riskDecay;

    // Pv и Vsigma
    const dLL = 0.1;             // заглушка: валидированные факты
    const dLogDetF = 0.2;        // инфо-бонус от новых фич
    const Pv = computePv(dLL, config.weights.kappa, dLogDetF);

    // учёт текущих шоков (если день окончил шок — убираем)
    if (activeShocks.has(t)) {
      cvarLevel = Math.max(0, cvarLevel - (activeShocks.get(t) || 0));
      activeShocks.delete(t);
    }

    const Vsigma = computeVsigma(
      exergyX,
      cvarLevel,
      infraH,
      causalC,
      dosePenalty,
      config.weights.lambda
    );

    // дрейф
    D = stepDrift(D, 0.0, 0.1, 0.0, e.dose - 1);

    // стабильность
    const S = computeS(Pv, Vsigma, D, Ttopo, Mw, config.weights.alpha);

    pts.push({ day: t, S, Pv, Vsigma, E, dose: e.dose });
  }

  return pts;
}
